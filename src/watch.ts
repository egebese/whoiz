import type { DomainInfo } from "./types.js";
import { lookup } from "./lookup.js";
import {
  readWatches,
  writeWatches,
  upsertWatch,
  removeWatch,
  log,
  type Watch,
} from "./state.js";
import { recordIfChanged, snapshotOf, lastSnapshot, diff } from "./history.js";
import { notify } from "./notify.js";
import * as scheduler from "./scheduler.js";

/** Tier names → human label, used in `watch list`. */
export type Tier =
  | "expired"
  | "critical"
  | "soon"
  | "near"
  | "active"
  | "calm"
  | "stable"
  | "watch";

/** All in seconds. The smallest tier (6h) is the floor for the firing schedule too. */
const TIER_INTERVALS: Record<Tier, number> = {
  expired: 6 * 3600,         //  domain past expiry — pipeline can flip any day
  critical: 6 * 3600,        //  ≤3 days to expiry / hold / redemption / pendingDelete
  soon: 24 * 3600,           //  ≤14 days
  near: 2 * 24 * 3600,       //  ≤30 days
  active: 7 * 24 * 3600,     //  ≤180 days
  calm: 14 * 24 * 3600,      //  ≤365 days
  stable: 30 * 24 * 3600,    //  >365 days
  watch: 24 * 3600,          //  state we don't otherwise know how to schedule
};

/** Pure: pick the tier from a fresh lookup. Exported for tests/debug. */
export function pickTier(info: DomainInfo): Tier {
  if (info.state === "redemption" || info.state === "pending-delete" || info.state === "hold") {
    return "critical";
  }
  if (info.state === "available") return "watch";
  if (typeof info.daysToExpiry === "number") {
    const d = info.daysToExpiry;
    if (d < 0) return "expired";
    if (d <= 3) return "critical";
    if (d <= 14) return "soon";
    if (d <= 30) return "near";
    if (d <= 180) return "active";
    if (d <= 365) return "calm";
    return "stable";
  }
  return "watch";
}

export function intervalForTier(t: Tier): number {
  return TIER_INTERVALS[t];
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function jitter(seconds: number): number {
  // ±10% so a hundred users on the same hourly cron don't all hit whois at once.
  const j = Math.floor(seconds * 0.1);
  return seconds + Math.floor(Math.random() * (2 * j + 1)) - j;
}

/** Rough English summary of a state change, used for notification body. */
function describeChange(info: DomainInfo, changes: ReturnType<typeof diff>): string | null {
  // Highest-signal changes first
  const stateChange = changes.find((c) => c.field === "state");
  if (stateChange) {
    if (stateChange.after === "available") return "Now available — register it before someone else does.";
    if (stateChange.after === "redemption") return "Entered redemption period.";
    if (stateChange.after === "pending-delete") return "Pending delete — drops within ~5 days.";
    if (stateChange.after === "registered" && stateChange.before === "available") return "Registered by someone.";
    return `State: ${stateChange.before ?? "?"} → ${stateChange.after}`;
  }
  const reg = changes.find((c) => c.field === "registrar");
  if (reg) return `Registrar: ${reg.before ?? "?"} → ${reg.after ?? "?"}`;
  const ns = changes.find((c) => c.field === "ns");
  if (ns) {
    const parts: string[] = [];
    if (ns.added?.length) parts.push(`+${ns.added.join(", ")}`);
    if (ns.removed?.length) parts.push(`-${ns.removed.join(", ")}`);
    return `Nameservers: ${parts.join(" ")}`;
  }
  const exp = changes.find((c) => c.field === "expiry");
  if (exp) return `Expiry: ${exp.before ?? "?"} → ${exp.after ?? "?"}`;
  if (info.state === "registered" && typeof info.daysToExpiry === "number" && info.daysToExpiry <= 7) {
    return `Expires in ${info.daysToExpiry} day${info.daysToExpiry === 1 ? "" : "s"}.`;
  }
  return null;
}

interface TickResult {
  domain: string;
  skipped: boolean;
  tier?: Tier;
  changed: boolean;
  removedFromWatch: boolean;
  error?: string;
}

/** Process one watch entry. Returns what happened, mutates state file. */
export async function tickOne(w: Watch, force = false): Promise<TickResult> {
  if (!force && w.nextRunAt > nowSec()) {
    return { domain: w.domain, skipped: true, changed: false, removedFromWatch: false };
  }

  let info: DomainInfo;
  try {
    info = await lookup(w.domain);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const failures = (w.failures ?? 0) + 1;
    // Exponential back-off on repeated network failure, capped at 24h.
    const backoff = Math.min(60 * 60 * 24, 60 * Math.pow(2, failures));
    upsertWatch(w.domain, { failures, nextRunAt: nowSec() + backoff });
    log(`tick error ${w.domain}: ${msg}`);
    return { domain: w.domain, skipped: false, changed: false, removedFromWatch: false, error: msg };
  }

  const snap = snapshotOf(info);
  const prev = lastSnapshot(w.domain);
  const { recorded, hash } = recordIfChanged(w.domain, snap);

  let changeMsg: string | null = null;
  if (recorded && prev) {
    const changes = diff(prev, snap);
    changeMsg = describeChange(info, changes);
  } else if (recorded && !prev) {
    // First snapshot: only notify if it's already in a noteworthy state
    if (info.state === "available") changeMsg = "Available right now.";
  }

  const tier = pickTier(info);
  const interval = jitter(intervalForTier(tier));

  // If the domain just became available, notify and stop watching.
  let removedFromWatch = false;
  if (info.state === "available") {
    if (changeMsg) await notify(`whoiz: ${w.domain}`, changeMsg);
    removeWatch(w.domain);
    removedFromWatch = true;
    log(`tick ${w.domain}: AVAILABLE — watch removed`);
  } else {
    upsertWatch(w.domain, {
      lastRunAt: nowSec(),
      nextRunAt: nowSec() + interval,
      lastSnapshotHash: hash,
      tier,
      failures: 0,
    });
    if (changeMsg) await notify(`whoiz: ${w.domain}`, changeMsg);
    log(`tick ${w.domain}: tier=${tier} next=+${interval}s changed=${recorded}`);
  }

  // If this was the last watch, take the scheduler down — leave nothing running.
  if (readWatches().watches.length === 0) {
    await scheduler.uninstall().catch(() => {});
  }

  return { domain: w.domain, skipped: false, tier, changed: recorded, removedFromWatch };
}

/** Run the scheduler entry — process all due watches in sequence. */
export async function tickAll(force = false): Promise<TickResult[]> {
  const file = readWatches();
  const results: TickResult[] = [];
  for (const w of file.watches.slice()) {
    try {
      results.push(await tickOne(w, force));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`tickAll fatal ${w.domain}: ${msg}`);
      results.push({ domain: w.domain, skipped: false, changed: false, removedFromWatch: false, error: msg });
    }
  }
  return results;
}

/** Add a domain to background watching. Lookup once now to seed state + tier. */
export async function addWatch(domain: string, note?: string): Promise<{ watch: Watch; tier: Tier; info: DomainInfo }> {
  const info = await lookup(domain);
  const tier = pickTier(info);
  const interval = jitter(intervalForTier(tier));
  const snap = snapshotOf(info);
  const { hash } = recordIfChanged(domain, snap);
  const watch = upsertWatch(domain, {
    nextRunAt: nowSec() + interval,
    lastRunAt: nowSec(),
    lastSnapshotHash: hash,
    tier,
    failures: 0,
    note,
  });

  // Make sure the OS scheduler is wired up.
  const st = scheduler.status();
  if (!st.installed) await scheduler.install();

  log(`watch added ${domain}: tier=${tier}`);
  return { watch, tier, info };
}

export function listWatches(): Watch[] {
  return readWatches().watches;
}

export async function dropWatch(domain: string): Promise<boolean> {
  const ok = removeWatch(domain);
  if (readWatches().watches.length === 0) {
    await scheduler.uninstall().catch(() => {});
  }
  return ok;
}

/** Force a tick for a single domain (used by `watch run <domain>`). */
export async function runOne(domain: string): Promise<TickResult> {
  const file = readWatches();
  const w = file.watches.find((x) => x.domain === domain);
  if (!w) throw new Error(`no watch for ${domain}`);
  return tickOne(w, true);
}

/** Reset all nextRunAt to 0 so the next scheduler firing processes everything. */
export function pokeAll(): number {
  const file = readWatches();
  for (const w of file.watches) w.nextRunAt = 0;
  writeWatches(file);
  return file.watches.length;
}
