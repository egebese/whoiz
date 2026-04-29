import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { ensureDirs, watchesFile, logFile } from "./paths.js";
import { appendFileSync, statSync, truncateSync } from "node:fs";

export interface Watch {
  domain: string;
  /** Seconds since epoch — when scheduler should next process this entry. */
  nextRunAt: number;
  /** Last successful tick (epoch seconds). */
  lastRunAt?: number;
  /** Hash of the last snapshot so we can skip identical history entries. */
  lastSnapshotHash?: string;
  /** Last computed tier name, kept for `watch list`. */
  tier?: string;
  /** Tracks consecutive failed ticks (network errors etc.) so we can back off. */
  failures?: number;
  /** Optional note set by the user. */
  note?: string;
}

export interface WatchesFile {
  version: 1;
  watches: Watch[];
}

const EMPTY: WatchesFile = { version: 1, watches: [] };

export function readWatches(): WatchesFile {
  ensureDirs();
  if (!existsSync(watchesFile())) return { ...EMPTY };
  try {
    const raw = readFileSync(watchesFile(), "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.watches)) return parsed as WatchesFile;
  } catch {
    // fall through — corrupted file, start fresh
  }
  return { ...EMPTY };
}

export function writeWatches(file: WatchesFile): void {
  ensureDirs();
  // Atomic write: stage to .tmp then rename so a crash mid-write can't corrupt state.
  const target = watchesFile();
  const tmp = target + ".tmp";
  writeFileSync(tmp, JSON.stringify(file, null, 2));
  renameSync(tmp, target);
}

export function upsertWatch(domain: string, patch: Partial<Watch> = {}): Watch {
  const file = readWatches();
  const idx = file.watches.findIndex((w) => w.domain === domain);
  if (idx >= 0) {
    file.watches[idx] = { ...file.watches[idx]!, ...patch, domain };
    writeWatches(file);
    return file.watches[idx]!;
  }
  const w: Watch = { domain, nextRunAt: 0, ...patch };
  file.watches.push(w);
  writeWatches(file);
  return w;
}

export function removeWatch(domain: string): boolean {
  const file = readWatches();
  const before = file.watches.length;
  file.watches = file.watches.filter((w) => w.domain !== domain);
  writeWatches(file);
  return file.watches.length < before;
}

const MAX_LOG_BYTES = 1_000_000; // ~1MB rotation

export function log(line: string): void {
  ensureDirs();
  const stamp = new Date().toISOString();
  const f = logFile();
  try {
    if (existsSync(f)) {
      const sz = statSync(f).size;
      if (sz > MAX_LOG_BYTES) truncateSync(f, 0);
    }
    appendFileSync(f, `${stamp} ${line}\n`);
  } catch {
    // log failure is non-fatal — the tick must keep running
  }
}
