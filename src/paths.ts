import { homedir, platform } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

/**
 * All whoiz state lives under one root so users can `rm -rf ~/.whoiz` to wipe it.
 *
 *   ~/.whoiz/
 *   ├── watches.json       # active background watches (state)
 *   ├── log                # tick log + notification log (rotates ~1MB)
 *   └── history/           # one append-only jsonl per domain
 *       └── google.com.jsonl
 */
export function root(): string {
  return join(homedir(), ".whoiz");
}

export function watchesFile(): string {
  return join(root(), "watches.json");
}

export function logFile(): string {
  return join(root(), "log");
}

export function historyDir(): string {
  return join(root(), "history");
}

export function historyFile(domain: string): string {
  return join(historyDir(), `${domain.toLowerCase()}.jsonl`);
}

/** launchd plist path (mac) */
export function launchdPlist(): string {
  return join(homedir(), "Library", "LaunchAgents", "co.whoiz.tick.plist");
}

/** systemd user timer/service paths (linux) */
export function systemdUnitDir(): string {
  return join(homedir(), ".config", "systemd", "user");
}

/** Where we put a tiny shim so the scheduler can find the whoiz binary
 *  even after a node version switch. */
export function shimPath(): string {
  return join(root(), platform() === "win32" ? "tick.cmd" : "tick.sh");
}

export function ensureDirs(): void {
  mkdirSync(root(), { recursive: true });
  mkdirSync(historyDir(), { recursive: true });
}
