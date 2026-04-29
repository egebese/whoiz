import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync, chmodSync, unlinkSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";
import { launchdPlist, shimPath, systemdUnitDir, ensureDirs, logFile } from "./paths.js";
import { log } from "./state.js";

/**
 * The scheduler fires once an hour. The tick itself is cheap — it reads
 * watches.json and only probes domains whose `nextRunAt` is due. So the
 * actual probe cadence is driven by tiers, not by the firing interval.
 */
const FIRE_INTERVAL_SECONDS = 3600;
const LABEL = "co.whoiz.tick";

function resolveCliPath(): string {
  // From dist/scheduler.js → dist/cli.js
  return fileURLToPath(new URL("./cli.js", import.meta.url));
}

function writeShim(): string {
  ensureDirs();
  const cli = resolveCliPath();
  const node = process.execPath;
  const out = shimPath();
  if (platform() === "win32") {
    const content = `@echo off\r\n"${node}" "${cli}" watch tick %*\r\n`;
    writeFileSync(out, content);
  } else {
    const content = `#!/bin/sh\nexec "${node}" "${cli}" watch tick "$@"\n`;
    writeFileSync(out, content);
    chmodSync(out, 0o755);
  }
  return out;
}

export interface SchedulerStatus {
  installed: boolean;
  platform: NodeJS.Platform;
  /** Where we wrote the platform's scheduler entry (plist / unit / task name). */
  entry?: string;
  shim?: string;
}

export function status(): SchedulerStatus {
  const p = platform();
  if (p === "darwin") {
    const inst = existsSync(launchdPlist());
    return { installed: inst, platform: p, entry: launchdPlist(), shim: shimPath() };
  }
  if (p === "win32") {
    const r = spawnSync("schtasks", ["/Query", "/TN", LABEL], { encoding: "utf8" });
    return { installed: r.status === 0, platform: p, entry: LABEL, shim: shimPath() };
  }
  // linux
  const unit = `${systemdUnitDir()}/whoiz-tick.timer`;
  if (existsSync(unit)) return { installed: true, platform: p, entry: unit, shim: shimPath() };
  // crontab fallback marker
  const cron = currentCrontab();
  if (cron && cron.includes(LABEL)) return { installed: true, platform: p, entry: "crontab", shim: shimPath() };
  return { installed: false, platform: p, shim: shimPath() };
}

export async function install(): Promise<SchedulerStatus> {
  const shim = writeShim();
  const p = platform();
  if (p === "darwin") await installMac(shim);
  else if (p === "win32") installWindows(shim);
  else installLinux(shim);
  log(`scheduler installed on ${p}`);
  return status();
}

export async function uninstall(): Promise<void> {
  const p = platform();
  if (p === "darwin") await uninstallMac();
  else if (p === "win32") uninstallWindows();
  else uninstallLinux();
  log(`scheduler uninstalled on ${p}`);
}

// ─── macOS launchd ─────────────────────────────────────────────────────────

function plistContent(shim: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${shim}</string>
    </array>
    <key>StartInterval</key>
    <integer>${FIRE_INTERVAL_SECONDS}</integer>
    <key>RunAtLoad</key>
    <false/>
    <key>StandardOutPath</key>
    <string>${logFile()}</string>
    <key>StandardErrorPath</key>
    <string>${logFile()}</string>
    <key>ProcessType</key>
    <string>Background</string>
    <key>LowPriorityIO</key>
    <true/>
    <key>Nice</key>
    <integer>10</integer>
</dict>
</plist>
`;
}

async function installMac(shim: string): Promise<void> {
  const path = launchdPlist();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, plistContent(shim));
  // Reload: unload (ignore failure if not loaded) then load.
  spawnSync("launchctl", ["unload", path], { stdio: "ignore" });
  const r = spawnSync("launchctl", ["load", "-w", path], { encoding: "utf8" });
  if (r.status !== 0) log(`launchctl load: ${r.stderr.trim()}`);
}

async function uninstallMac(): Promise<void> {
  const path = launchdPlist();
  if (existsSync(path)) {
    spawnSync("launchctl", ["unload", path], { stdio: "ignore" });
    unlinkSync(path);
  }
}

// ─── Windows schtasks ──────────────────────────────────────────────────────

function installWindows(shim: string): void {
  // /F overwrites if exists. /sc HOURLY /mo 1 = every hour. /RL LIMITED keeps
  // the task at user privileges (no UAC) so it runs silently in the background.
  const r = spawnSync(
    "schtasks",
    [
      "/Create",
      "/SC", "HOURLY",
      "/MO", "1",
      "/TN", LABEL,
      "/TR", `"${shim}"`,
      "/F",
      "/RL", "LIMITED",
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) log(`schtasks create: ${r.stderr.trim()}`);
}

function uninstallWindows(): void {
  spawnSync("schtasks", ["/Delete", "/TN", LABEL, "/F"], { stdio: "ignore" });
}

// ─── Linux systemd (fallback: crontab) ─────────────────────────────────────

function hasSystemd(): boolean {
  const r = spawnSync("systemctl", ["--user", "is-system-running"], { encoding: "utf8" });
  // We don't care about the actual state ("running"/"degraded"/...) — we just
  // need systemctl to be present and to talk to a user instance.
  return r.status !== null && r.error === undefined;
}

function unitFiles(shim: string) {
  return {
    service: `[Unit]
Description=whoiz background tick

[Service]
Type=oneshot
Nice=10
IOSchedulingClass=idle
ExecStart=${shim}
StandardOutput=append:${logFile()}
StandardError=append:${logFile()}
`,
    timer: `[Unit]
Description=whoiz tick every hour

[Timer]
OnBootSec=2min
OnUnitActiveSec=${FIRE_INTERVAL_SECONDS}s
Persistent=true
AccuracySec=15min

[Install]
WantedBy=timers.target
`,
  };
}

function installLinux(shim: string): void {
  if (hasSystemd()) {
    const dir = systemdUnitDir();
    mkdirSync(dir, { recursive: true });
    const u = unitFiles(shim);
    writeFileSync(`${dir}/whoiz-tick.service`, u.service);
    writeFileSync(`${dir}/whoiz-tick.timer`, u.timer);
    spawnSync("systemctl", ["--user", "daemon-reload"], { stdio: "ignore" });
    spawnSync("systemctl", ["--user", "enable", "--now", "whoiz-tick.timer"], { stdio: "ignore" });
    return;
  }
  installCrontab(shim);
}

function uninstallLinux(): void {
  const dir = systemdUnitDir();
  const t = `${dir}/whoiz-tick.timer`;
  const s = `${dir}/whoiz-tick.service`;
  if (existsSync(t) || existsSync(s)) {
    spawnSync("systemctl", ["--user", "disable", "--now", "whoiz-tick.timer"], { stdio: "ignore" });
    if (existsSync(t)) unlinkSync(t);
    if (existsSync(s)) unlinkSync(s);
    spawnSync("systemctl", ["--user", "daemon-reload"], { stdio: "ignore" });
  }
  uninstallCrontab();
}

function currentCrontab(): string | null {
  const r = spawnSync("crontab", ["-l"], { encoding: "utf8" });
  if (r.status === 0) return r.stdout;
  return null;
}

function installCrontab(shim: string): void {
  const existing = currentCrontab() ?? "";
  if (existing.includes(LABEL)) return;
  const line = `0 * * * * ${shim} # ${LABEL}\n`;
  const next = existing.endsWith("\n") || existing === "" ? existing + line : existing + "\n" + line;
  writeCrontabSync(next);
}

function uninstallCrontab(): void {
  const existing = currentCrontab();
  if (!existing) return;
  const next = existing
    .split("\n")
    .filter((l) => !l.includes(LABEL))
    .join("\n");
  writeCrontabSync(next);
}

function writeCrontabSync(content: string): void {
  const r = spawnSync("crontab", ["-"], { input: content, encoding: "utf8" });
  if (r.status !== 0) log(`crontab write: ${r.stderr?.trim()}`);
}

// Expose for `whoiz watch doctor`
export function readShim(): string | null {
  const p = shimPath();
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf8");
}
