import { spawn } from "node:child_process";
import { platform } from "node:os";
import { log } from "./state.js";

/**
 * Best-effort desktop notification. We never throw — if every backend fails
 * we just write to the log so the tick keeps running.
 */
export async function notify(title: string, body: string): Promise<void> {
  log(`notify: ${title} — ${body}`);
  const p = platform();
  try {
    if (p === "darwin") return await mac(title, body);
    if (p === "win32") return await windows(title, body);
    return await linux(title, body);
  } catch (err) {
    log(`notify failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with ${code}`));
    });
    // Give every backend at most 5s — notifications are advisory, never blocking.
    setTimeout(() => {
      child.kill();
      resolve();
    }, 5000).unref();
  });
}

function escapeAppleScript(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function mac(title: string, body: string): Promise<void> {
  const script = `display notification "${escapeAppleScript(body)}" with title "${escapeAppleScript(title)}"`;
  await run("osascript", ["-e", script]);
}

async function linux(title: string, body: string): Promise<void> {
  // notify-send is on most desktop distros; if missing, the catch in notify() logs it.
  await run("notify-send", ["-a", "whoiz", title, body]);
}

function escapePs(s: string): string {
  return s.replace(/'/g, "''");
}

async function windows(title: string, body: string): Promise<void> {
  // Use built-in Windows.UI.Notifications via PowerShell. Works on Win10+ without
  // any extra modules so the package stays dependency-free.
  const ps = `
$ErrorActionPreference = 'Stop'
[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime] | Out-Null
$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$texts = $template.GetElementsByTagName('text')
$texts.Item(0).AppendChild($template.CreateTextNode('${escapePs(title)}')) | Out-Null
$texts.Item(1).AppendChild($template.CreateTextNode('${escapePs(body)}')) | Out-Null
$toast = [Windows.UI.Notifications.ToastNotification]::new($template)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('whoiz').Show($toast)
`.trim();
  await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps]);
}
