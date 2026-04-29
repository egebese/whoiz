# whoiz

Pretty `whois` for humans. Bulk lookups, EPP status decoding, redemption-period
explanations, and a one-keystroke jump to a registrar when a domain is free.

```bash
npx @egebese/whoiz google.com
```

[![npm version](https://img.shields.io/npm/v/@egebese/whoiz.svg?color=cb3837&logo=npm)](https://www.npmjs.com/package/@egebese/whoiz)
[![npm downloads](https://img.shields.io/npm/dm/@egebese/whoiz.svg?color=cb3837)](https://www.npmjs.com/package/@egebese/whoiz)
[![GitHub stars](https://img.shields.io/github/stars/egebese/whoiz.svg?style=social)](https://github.com/egebese/whoiz/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/egebese/whoiz.svg)](https://github.com/egebese/whoiz/issues)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)

## Features

- **Bulk lookups** — `whoiz a.com b.io c.shop` runs in parallel.
- **Field queries** — `whoiz a.com status,period` shows only what you asked for.
- **EPP status decoder** — every `clientTransferProhibited` etc. comes with a plain-language explanation.
- **Lifecycle awareness** — knows the difference between `redemptionPeriod`, `pendingDelete`, auto-renew grace, and gives an ETA for when a domain becomes registerable again.
- **Available? Browser opens.** — when a domain is free, `whoiz` opens a Spaceship search so you can grab it in one step. (`--no-open` to disable.)
- **TUI mode** — `whoiz a.com b.com --tui` for an interactive Ink-based viewer.
- **Background watch** — `whoiz watch add domain.com` installs a launchd / Schtasks / systemd-timer agent that re-polls on an adaptive cadence (weekly when 6 months out, daily near expiry, every 6h in redemption) and notifies on state change. Auto-uninstalls when nothing's left to watch.
- **WHOIS history** — every probe writes a snapshot, `whoiz history domain.com` shows every registrar / nameserver / status change since you started watching.
- **Foreground watch** — `whoiz a.com --watch` re-polls in place, default every 60s, for live monitoring in a terminal pane.
- **ccTLD-aware** — falls back to system `whois` for TLDs like `.tr`, `.de`, `.fr`, `.nl`, `.it`, `.ru` and decodes their non-EPP status codes.
- **Shell completion** — `whoiz --completion bash|zsh|fish` ships ready-to-source scripts.
- **JSON output** — `--json` for scripting.

## Install

```bash
# one-off via npx
npx @egebese/whoiz google.com

# or install globally
npm i -g @egebese/whoiz
whoiz google.com
```

The CLI command is `whoiz` regardless of how you install it.

## Usage

```bash
whoiz <domain> [<domain> …] [fields]
```

### Single lookup

```bash
whoiz cloudflare.com
```

### Bulk

```bash
whoiz cloudflare.com vercel.com github.com
```

### Field-only output

Both comma and slash separators work:

```bash
whoiz google.com status,period
whoiz google.com status/period/expiry
whoiz google.com -f registrar,ns
```

Available field tokens: `status`, `period`, `expiry`, `created`, `updated`,
`registrar`, `ns`, `dnssec`, `links`, `raw`.

### TUI mode

Bare `whoiz` (no arguments) launches the interactive TUI. You can also start
with domains preloaded:

```bash
whoiz                       # empty TUI, type to query
whoiz --tui                 # same thing, explicit
whoiz cloudflare.com --tui  # preload one or more lookups
```

In the TUI:

- Type a domain (or several, separated by space/comma) and press **Enter** to look up.
- **Tab** / **Shift+Tab** — switch between previous lookups.
- **Ctrl+O** — open the current domain on Spaceship in your browser.
- **Ctrl+D** — drop the current entry from history.
- **Esc** or **Ctrl+C** — quit.

### JSON

```bash
whoiz cloudflare.com --json
```

### Disable browser auto-open

```bash
whoiz somenewname.io --no-open
```

### Force the register flow

```bash
whoiz mybrand.shop -r
```

### Foreground watch

Polls the same domain(s) on a schedule and redraws the box in place. Best for
short-lived monitoring inside a terminal — for set-and-forget monitoring use
`whoiz watch add` (below).

```bash
whoiz google.com --watch              # every 60s (default)
whoiz google.com --watch -i 30        # every 30s
whoiz a.com b.com --watch -i 600      # check both, every 10min
```

Stop with Ctrl+C.

### Background watch (launchd / Schtasks / systemd)

Adds a domain to a tiny on-disk watchlist and registers a single OS scheduler
entry that wakes once an hour to process due entries. The polling cadence is
adaptive:

| Time-to-expiry | Probe every |
| --- | --- |
| > 1 year | 30 days |
| 180 d – 1 y | 14 days |
| 30 – 180 d | 7 days |
| 14 – 30 d | 2 days |
| 3 – 14 d | 1 day |
| ≤ 3 d / hold / redemption / pendingDelete | 6 hours |

```bash
whoiz watch add mydomain.com                 # start watching
whoiz watch add a.com b.com --note "personal"
whoiz watch list                             # see tier + next probe
whoiz watch run mydomain.com                 # manual probe now
whoiz watch remove mydomain.com              # stop watching
whoiz watch status                           # is the scheduler installed?
whoiz watch doctor                           # detailed diagnostics + recent log
```

Notifications use the OS-native channel — `osascript display notification` on
macOS, `Windows.UI.Notifications` on Windows, `notify-send` on Linux — so no
extra dependencies. State lives in `~/.whoiz/`.

Self-cleaning: when the last watch is removed (or a watched domain becomes
available) the scheduler entry is uninstalled automatically. Nothing keeps
running once you've stopped watching.

Resource cost: hourly wake, ~50 ms of work per fire if nothing is due. Mac and
Linux entries are marked `LowPriorityIO` / `IOSchedulingClass=idle`; Windows is
`LIMITED` privilege.

### History

Every probe (foreground or background) records a normalized snapshot to
`~/.whoiz/history/<domain>.jsonl`. `whoiz history` walks that and shows only
the changes between snapshots:

```bash
whoiz history mydomain.com
whoiz history mydomain.com --json
```

```
2026-02-15T00:00:00Z  3 changes
  registrar  OldReg → NewReg
  expiry     2026-12-31T00:00:00Z → 2027-12-31T00:00:00Z
  ns         +c.example.com  -b.example.com

2026-04-01T00:00:00Z  2 changes
  state      registered → redemption
  statuses   +redemptionperiod  -clienttransferprohibited
```

History is local-only — there's no service to query for retroactive data, but
once a domain is on your watchlist whoiz will catch every registrar / NS /
status / expiry change going forward.

### Shell completion

```bash
# bash
whoiz --completion bash > /usr/local/etc/bash_completion.d/whoiz

# zsh
whoiz --completion zsh > "${fpath[1]}/_whoiz" && compinit

# fish
whoiz --completion fish > ~/.config/fish/completions/whoiz.fish
```

## How the lifecycle is interpreted

| State            | Meaning                                                                         |
| ---------------- | ------------------------------------------------------------------------------- |
| AVAILABLE        | TLD's whois says no record exists. Register link opens automatically.            |
| REGISTERED       | Active registration; expiry countdown shown.                                    |
| REDEMPTION       | `redemptionPeriod` set — owner can restore for a high fee, public can't grab.   |
| PENDING DELETE   | `pendingDelete` set — drop in ~5 days, then public registration opens.          |
| PENDING TRANSFER | `pendingTransfer` set — transfer in flight (~5 days).                           |
| HOLD             | `clientHold` / `serverHold` set — DNS suspended.                                |

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full release history.

## Contributing

PRs and issues welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening
one — it covers local setup, the project layout, what makes a good change, and
the release flow.

If `whoiz` saved you a tab, a star helps others find it:
[![Star on GitHub](https://img.shields.io/github/stars/egebese/whoiz?style=social)](https://github.com/egebese/whoiz/stargazers)

## Star history

[![Star History Chart](https://api.star-history.com/svg?repos=egebese/whoiz&type=Date)](https://star-history.com/#egebese/whoiz&Date)

## License

MIT © Ege Beşe
