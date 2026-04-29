import pc from "picocolors";
import { listWatches, addWatch, dropWatch, tickAll, runOne, pokeAll, intervalForTier, type Tier } from "./watch.js";
import * as scheduler from "./scheduler.js";
import { readHistory, diff } from "./history.js";
import { historyFile, logFile, root, watchesFile } from "./paths.js";
import { existsSync, readFileSync } from "node:fs";

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

function relTime(epochSec: number): string {
  const d = Math.floor(Date.now() / 1000) - epochSec;
  if (d < 0) {
    const s = -d;
    if (s < 60) return `in ${s}s`;
    if (s < 3600) return `in ${Math.round(s / 60)}m`;
    if (s < 86400) return `in ${Math.round(s / 3600)}h`;
    return `in ${Math.round(s / 86400)}d`;
  }
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.round(d / 60)}m ago`;
  if (d < 86400) return `${Math.round(d / 3600)}h ago`;
  return `${Math.round(d / 86400)}d ago`;
}

function tierColor(t?: Tier): (s: string) => string {
  switch (t) {
    case "critical":
    case "expired":
      return pc.red;
    case "soon":
      return pc.yellow;
    case "near":
      return pc.cyan;
    case "active":
    case "calm":
    case "stable":
      return pc.green;
    default:
      return pc.dim;
  }
}

// ─── watch subcommand ──────────────────────────────────────────────────────

export interface WatchOpts {
  note?: string;
  force?: boolean;
  verbose?: boolean;
  json?: boolean;
}

export async function watchCmd(args: string[], opts: WatchOpts = {}): Promise<number> {
  const [sub, ...rest] = args;
  switch (sub) {
    case "add":
      return watchAdd(rest, opts);
    case "rm":
    case "remove":
      return watchRemove(rest);
    case "ls":
    case "list":
    case undefined:
      return watchList();
    case "tick":
      return watchTick(opts);
    case "run":
      return watchRun(rest);
    case "install":
      return watchInstall();
    case "uninstall":
      return watchUninstall();
    case "status":
      return watchStatus();
    case "doctor":
      return watchDoctor();
    case "poke":
      pokeAll();
      process.stdout.write("All watches will be processed on next tick.\n");
      return 0;
    default:
      process.stderr.write(`whoiz: unknown watch subcommand "${sub}"\n`);
      return 2;
  }
}

async function watchAdd(args: string[], opts: WatchOpts): Promise<number> {
  const domains = args.filter((a) => DOMAIN_RE.test(a));
  if (domains.length === 0) {
    process.stderr.write("whoiz watch add <domain> [--note \"...\"]\n");
    return 2;
  }
  for (const d of domains) {
    const { tier } = await addWatch(d.toLowerCase(), opts.note);
    process.stdout.write(`${pc.green("✓")} watching ${pc.bold(d)} ${pc.dim("(tier: " + tier + ", interval: " + humanInterval(intervalForTier(tier)) + ")")}\n`);
  }
  const st = scheduler.status();
  if (st.installed) {
    process.stdout.write(pc.dim(`scheduler: installed (${st.platform})\n`));
  } else {
    process.stdout.write(pc.yellow("warning: scheduler did not install — run `whoiz watch doctor`\n"));
  }
  return 0;
}

async function watchRemove(args: string[]): Promise<number> {
  if (args.length === 0) {
    process.stderr.write("whoiz watch remove <domain>\n");
    return 2;
  }
  for (const d of args) {
    const ok = await dropWatch(d.toLowerCase());
    process.stdout.write(`${ok ? pc.green("✓") : pc.dim("·")} ${ok ? "removed" : "not watching"} ${d}\n`);
  }
  return 0;
}

async function watchList(): Promise<number> {
  const list = listWatches();
  if (list.length === 0) {
    process.stdout.write(pc.dim("No domains being watched. Add one with `whoiz watch add <domain>`.\n"));
    return 0;
  }
  const rows = list.map((w) => {
    const tier = (w.tier ?? "watch") as Tier;
    const next = w.nextRunAt ? relTime(w.nextRunAt) : "—";
    const last = w.lastRunAt ? relTime(w.lastRunAt) : "—";
    return {
      domain: w.domain,
      tier: tierColor(tier)(tier),
      last,
      next,
      note: w.note ?? "",
    };
  });
  const widths = {
    domain: Math.max(6, ...rows.map((r) => r.domain.length)),
    last: Math.max(4, ...rows.map((r) => r.last.length)),
    next: Math.max(4, ...rows.map((r) => r.next.length)),
  };
  process.stdout.write(
    pc.dim(
      `${"DOMAIN".padEnd(widths.domain)}  TIER       ${"LAST".padEnd(widths.last)}  ${"NEXT".padEnd(widths.next)}  NOTE\n`,
    ),
  );
  for (const r of rows) {
    process.stdout.write(
      `${r.domain.padEnd(widths.domain)}  ${r.tier.padEnd(20)}  ${r.last.padEnd(widths.last)}  ${r.next.padEnd(widths.next)}  ${r.note}\n`,
    );
  }
  const st = scheduler.status();
  process.stdout.write(
    "\n" +
      pc.dim(
        `scheduler: ${st.installed ? pc.green("installed") : pc.yellow("not installed")} (${st.platform})\n`,
      ),
  );
  return 0;
}

async function watchTick(opts: WatchOpts): Promise<number> {
  const results = await tickAll(opts.force ?? false);
  if (opts.verbose) {
    for (const r of results) {
      const note = r.error
        ? pc.red(`error: ${r.error}`)
        : r.skipped
          ? pc.dim("skip")
          : `tier=${r.tier ?? "?"} changed=${r.changed}${r.removedFromWatch ? " removed" : ""}`;
      process.stdout.write(`${r.domain}  ${note}\n`);
    }
  }
  return 0;
}

async function watchRun(args: string[]): Promise<number> {
  if (args.length === 0) {
    process.stderr.write("whoiz watch run <domain>\n");
    return 2;
  }
  const r = await runOne(args[0]!.toLowerCase());
  process.stdout.write(`${r.domain}: tier=${r.tier ?? "?"} changed=${r.changed}${r.removedFromWatch ? " (removed)" : ""}\n`);
  if (r.error) process.stdout.write(pc.red(`error: ${r.error}\n`));
  return r.error ? 1 : 0;
}

async function watchInstall(): Promise<number> {
  const st = await scheduler.install();
  process.stdout.write(
    `${pc.green("✓")} scheduler installed on ${st.platform}\n` +
      pc.dim(`entry: ${st.entry}\nshim:  ${st.shim}\n`),
  );
  return 0;
}

async function watchUninstall(): Promise<number> {
  await scheduler.uninstall();
  process.stdout.write(`${pc.green("✓")} scheduler uninstalled\n`);
  return 0;
}

async function watchStatus(): Promise<number> {
  const st = scheduler.status();
  const list = listWatches();
  process.stdout.write(
    `scheduler: ${st.installed ? pc.green("installed") : pc.yellow("not installed")} (${st.platform})\n` +
      pc.dim(`entry: ${st.entry ?? "—"}\nshim:  ${st.shim ?? "—"}\n`) +
      `watches: ${list.length}\n`,
  );
  return 0;
}

async function watchDoctor(): Promise<number> {
  const lines: string[] = [];
  const st = scheduler.status();
  lines.push(`platform: ${st.platform}`);
  lines.push(`scheduler installed: ${st.installed ? "yes" : "no"}`);
  lines.push(`scheduler entry: ${st.entry ?? "—"}`);
  lines.push(`shim path: ${st.shim ?? "—"}`);
  lines.push(`shim exists: ${st.shim && existsSync(st.shim) ? "yes" : "no"}`);
  lines.push(`watches file: ${watchesFile()} ${existsSync(watchesFile()) ? pc.green("(present)") : pc.dim("(absent)")}`);
  lines.push(`log file: ${logFile()} ${existsSync(logFile()) ? pc.green("(present)") : pc.dim("(absent)")}`);
  if (st.shim && existsSync(st.shim)) {
    lines.push("");
    lines.push("shim contents:");
    lines.push(readFileSync(st.shim, "utf8").trim());
  }
  if (existsSync(logFile())) {
    lines.push("");
    lines.push("recent log lines:");
    const log = readFileSync(logFile(), "utf8").trim().split("\n");
    for (const l of log.slice(-15)) lines.push("  " + l);
  }
  process.stdout.write(lines.join("\n") + "\n");
  return 0;
}

function humanInterval(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

// ─── history subcommand ────────────────────────────────────────────────────

export function historyCmd(args: string[], opts: { json?: boolean } = {}): number {
  const [domain] = args;
  if (!domain) {
    process.stderr.write("whoiz history <domain> [--json]\n");
    return 2;
  }
  const json = opts.json ?? false;
  const snaps = readHistory(domain.toLowerCase());
  if (snaps.length === 0) {
    process.stderr.write(`No history for ${domain}. Lookups recorded automatically when added to a watch (\`whoiz watch add\`).\n`);
    return 1;
  }
  if (json) {
    process.stdout.write(JSON.stringify(snaps, null, 2) + "\n");
    return 0;
  }
  process.stdout.write(pc.bold(`History for ${domain}`) + ` (${snaps.length} snapshot${snaps.length === 1 ? "" : "s"})\n`);
  process.stdout.write(pc.dim(historyFile(domain.toLowerCase())) + "\n\n");

  // Render the first snapshot as the baseline, then changes from there.
  const first = snaps[0]!;
  process.stdout.write(`${pc.dim(first.ts)}  ${pc.bold("baseline")}\n`);
  process.stdout.write(`  state:     ${first.state}\n`);
  if (first.registrar) process.stdout.write(`  registrar: ${first.registrar}\n`);
  if (first.expiry) process.stdout.write(`  expiry:    ${first.expiry}\n`);
  if (first.ns.length) process.stdout.write(`  ns:        ${first.ns.join(", ")}\n`);
  if (first.statuses.length) process.stdout.write(`  statuses:  ${first.statuses.join(", ")}\n`);
  process.stdout.write("\n");

  for (let i = 1; i < snaps.length; i++) {
    const prev = snaps[i - 1]!;
    const cur = snaps[i]!;
    const changes = diff(prev, cur);
    if (changes.length === 0) continue;
    process.stdout.write(`${pc.dim(cur.ts)}  ${changes.length} change${changes.length === 1 ? "" : "s"}\n`);
    for (const c of changes) {
      if (c.added || c.removed) {
        const parts: string[] = [];
        if (c.added?.length) parts.push(pc.green(`+${c.added.join(", ")}`));
        if (c.removed?.length) parts.push(pc.red(`-${c.removed.join(", ")}`));
        process.stdout.write(`  ${c.field.padEnd(10)} ${parts.join("  ")}\n`);
      } else {
        process.stdout.write(
          `  ${c.field.padEnd(10)} ${pc.red(c.before ?? "—")} ${pc.dim("→")} ${pc.green(c.after ?? "—")}\n`,
        );
      }
    }
    process.stdout.write("\n");
  }
  return 0;
}

// ─── debug subcommand (handy in CI / testing) ──────────────────────────────

export function debugCmd(args: string[]): number {
  const [sub] = args;
  if (sub === "paths") {
    process.stdout.write(`root:    ${root()}\nwatches: ${watchesFile()}\nlog:     ${logFile()}\n`);
    return 0;
  }
  process.stderr.write("whoiz debug paths\n");
  return 2;
}
