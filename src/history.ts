import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { DomainInfo } from "./types.js";
import { ensureDirs, historyFile } from "./paths.js";

/**
 * What we keep per snapshot. Deliberately small — this is JSONL on disk and
 * one file per domain, so we want each line to be cheap to read/diff and
 * resistant to whois-formatting jitter (different servers, different cases).
 */
export interface Snapshot {
  /** ISO 8601, second precision. */
  ts: string;
  state: string;
  registrar?: string;
  registrarIanaId?: string;
  whoisServer?: string;
  expiry?: string;
  created?: string;
  updated?: string;
  /** Sorted, lowercased — so reordering doesn't look like a change. */
  ns: string[];
  /** First token of each EPP status, sorted, lowercased. */
  statuses: string[];
  dnssec?: string;
}

function normalizeNs(list: string[]): string[] {
  return Array.from(new Set(list.map((s) => s.trim().toLowerCase()).filter(Boolean))).sort();
}

function normalizeStatuses(list: string[]): string[] {
  return Array.from(
    new Set(
      list
        .map((s) => s.split(/\s+/)[0]?.toLowerCase() ?? "")
        .filter(Boolean),
    ),
  ).sort();
}

export function snapshotOf(info: DomainInfo): Snapshot {
  return {
    ts: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    state: info.state,
    registrar: info.registrar,
    registrarIanaId: info.registrarIanaId,
    whoisServer: info.whoisServer,
    expiry: info.expiryDate,
    created: info.createdDate,
    updated: info.updatedDate,
    ns: normalizeNs(info.nameServers ?? []),
    statuses: normalizeStatuses(info.statuses ?? []),
    dnssec: info.dnssec,
  };
}

/** Stable hash that ignores `ts` and `updated` (which churns without real change). */
export function snapshotHash(s: Snapshot): string {
  const stable = {
    state: s.state,
    registrar: s.registrar,
    registrarIanaId: s.registrarIanaId,
    whoisServer: s.whoisServer,
    expiry: s.expiry,
    created: s.created,
    ns: s.ns,
    statuses: s.statuses,
    dnssec: s.dnssec,
  };
  return createHash("sha1").update(JSON.stringify(stable)).digest("hex");
}

export function readHistory(domain: string): Snapshot[] {
  const f = historyFile(domain);
  if (!existsSync(f)) return [];
  const raw = readFileSync(f, "utf8");
  const out: Snapshot[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as Snapshot);
    } catch {
      // skip malformed line
    }
  }
  return out;
}

export function lastSnapshot(domain: string): Snapshot | undefined {
  const all = readHistory(domain);
  return all[all.length - 1];
}

export function appendSnapshot(domain: string, snap: Snapshot): void {
  ensureDirs();
  appendFileSync(historyFile(domain), JSON.stringify(snap) + "\n");
}

/** Write a snapshot only if it differs from the last one. Returns the hash either way. */
export function recordIfChanged(
  domain: string,
  snap: Snapshot,
): { recorded: boolean; hash: string } {
  const hash = snapshotHash(snap);
  const prev = lastSnapshot(domain);
  if (prev && snapshotHash(prev) === hash) return { recorded: false, hash };
  appendSnapshot(domain, snap);
  return { recorded: true, hash };
}

export interface DiffEntry {
  field: "state" | "registrar" | "ns" | "statuses" | "expiry" | "dnssec" | "whoisServer";
  before?: string;
  after?: string;
  /** For ns/statuses where multiple things change at once. */
  added?: string[];
  removed?: string[];
}

export function diff(a: Snapshot, b: Snapshot): DiffEntry[] {
  const out: DiffEntry[] = [];

  const scalar: Array<{
    field: DiffEntry["field"];
    a?: string;
    b?: string;
  }> = [
    { field: "state", a: a.state, b: b.state },
    { field: "registrar", a: a.registrar, b: b.registrar },
    { field: "expiry", a: a.expiry, b: b.expiry },
    { field: "dnssec", a: a.dnssec, b: b.dnssec },
    { field: "whoisServer", a: a.whoisServer, b: b.whoisServer },
  ];
  for (const s of scalar) {
    if ((s.a ?? "") !== (s.b ?? "")) {
      out.push({ field: s.field, before: s.a, after: s.b });
    }
  }

  const setDiff = (
    field: DiffEntry["field"],
    aArr: string[] = [],
    bArr: string[] = [],
  ) => {
    const aSet = new Set(aArr);
    const bSet = new Set(bArr);
    const added = bArr.filter((x) => !aSet.has(x));
    const removed = aArr.filter((x) => !bSet.has(x));
    if (added.length || removed.length) out.push({ field, added, removed });
  };

  setDiff("ns", a.ns, b.ns);
  setDiff("statuses", a.statuses, b.statuses);

  return out;
}
