# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] — 2026-04-29

### Added
- **Background watch — `whoiz watch <add|list|remove|run|tick|status|doctor>`.**
  One-time install of an OS-native scheduler entry (launchd plist on macOS,
  `schtasks /SC HOURLY /RL LIMITED` on Windows, systemd user timer with crontab
  fallback on Linux). Fires hourly with `LowPriorityIO` / `IOSchedulingClass=idle`
  so it never wakes the machine and never trends in Activity Monitor.
- **Adaptive cadence per watch.** Probe every 30d when expiry is over a year
  out, scaling down to 6h when the domain is in `redemptionPeriod`,
  `pendingDelete`, `clientHold`, or within 3 days of expiry.
- **Auto-cleanup.** When the last watch is removed or a watched domain becomes
  available, the scheduler entry is uninstalled. Nothing keeps running once
  you've stopped watching.
- **Native notifications.** `osascript display notification` on macOS,
  `Windows.UI.Notifications` via PowerShell on Windows, `notify-send` on Linux.
  No new dependencies.
- **WHOIS history — `whoiz history <domain>`.** Every probe writes a normalized
  snapshot to `~/.whoiz/history/<domain>.jsonl`. The history command prints the
  baseline plus only the deltas (registrar, NS adds/removes, expiry, statuses,
  state, dnssec). Snapshots deduplicated by stable hash. `--json` for scripting.
- **Watch diagnostics — `whoiz watch doctor`.** Shows scheduler entry, shim
  contents, watches file, and the last 15 lines of the rotating ~1MB log.
- **Resilience.** ±10% jitter on every interval so users sharing a cron
  tick don't dogpile whois servers. Exponential back-off on network failure
  (cap 24h).

### Changed
- `whoiz watch ...` is now the recommended path for set-and-forget monitoring.
  The old `whoiz <domain> --watch` foreground loop is kept for live in-terminal
  monitoring.
- Help text updated to surface the new subcommands.

## [0.2.0] — 2026-04-28

### Added
- **System whois fallback.** Falls back to the system `whois` binary when
  `whoiser` returns no useful data, the state is unknown, or the TLD is in the
  `SYSTEM_WHOIS_FIRST` set (`.tr`, `.de`, `.fr`, `.nl`, `.it`, `.ru`, plus
  `.be`, `.no`, `.dk`, `.se`, `.fi`, `.pl`, `.cz`, `.su`).
- **ccTLD-specific status decoders.** `connect` / `free` / `failed` / `invalid`
  (DENIC), `ACTIVE` / `RESERVED` / `RESTRICTED` / `BLOCKED` (TRABIS),
  `FROZEN` (AFNIC), `in quarantine` (SIDN), `REGISTERED` / `DELEGATED` /
  `VERIFIED` (generic ccTLD).
- **Foreground `--watch` mode** (`-w`, `--interval`/`-i`). Re-polls in place
  on a fixed interval, redrawing the box. Defaults to every 60s.
- **Shell completion scripts.** `whoiz --completion bash|zsh|fish` outputs a
  ready-to-source completion script.
- **Lower-cased status code lookup.** Cloudflare's whois returns lowercase
  `clientdeleteprohibited`; we now match case-insensitively.
- **Parenthesized URL stripping** in status codes — handles
  `clientTransferProhibited (https://icann.org/...)` form.

### Fixed
- Long URLs no longer break box alignment (truncated with hard width).
- Box width is now dynamic: clamped to terminal width between 60 and 110 cols.
- Available-state register links print outside the box so the URL stays
  clickable in terminals that auto-link.

## [0.1.1] — 2026-04-28

### Fixed
- Re-publish to register the `whoiz` bin entry. The 0.1.0 tarball had its
  `bin[whoiz]` script stripped by npm because the path was prefixed with `./`.

## [0.1.0] — 2026-04-28

### Added
- Initial release. Pretty `whois` for humans:
  - Bulk lookups (`whoiz a.com b.io c.shop`) run in parallel.
  - Field queries: `whoiz domain.tld status,period`.
  - EPP status decoder with severity icons and plain-language descriptions.
  - Lifecycle awareness: differentiates `redemptionPeriod`, `pendingDelete`,
    auto-renew grace, etc., and gives an ETA for when a domain becomes
    registerable again.
  - Auto-opens a Spaceship search in the browser when a domain is available
    (`--no-open` to disable).
  - Interactive Ink-based TUI (`whoiz` with no args, or `--tui`).
  - JSON output (`--json`).

[0.3.0]: https://github.com/egebese/whoiz/releases/tag/v0.3.0
[0.2.0]: https://github.com/egebese/whoiz/releases/tag/v0.2.0
[0.1.1]: https://github.com/egebese/whoiz/releases/tag/v0.1.1
[0.1.0]: https://github.com/egebese/whoiz/releases/tag/v0.1.0
