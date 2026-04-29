# whoiz

Pretty `whois` for humans. Bulk lookups, EPP status decoding, redemption-period
explanations, and a one-keystroke jump to a registrar when a domain is free.

```bash
npx whoiz google.com
```

![status](https://img.shields.io/badge/node-%3E%3D18-brightgreen) ![license](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Bulk lookups** — `whoiz a.com b.io c.shop` runs in parallel.
- **Field queries** — `whoiz a.com status,period` shows only what you asked for.
- **EPP status decoder** — every `clientTransferProhibited` etc. comes with a plain-language explanation.
- **Lifecycle awareness** — knows the difference between `redemptionPeriod`, `pendingDelete`, auto-renew grace, and gives an ETA for when a domain becomes registerable again.
- **Available? Browser opens.** — when a domain is free, `whoiz` opens a Spaceship search so the affiliate cookie is set in one step. (`--no-open` to disable.)
- **TUI mode** — `whoiz a.com b.com --tui` for an interactive Ink-based viewer.
- **JSON output** — `--json` for scripting.

## Install

```bash
# one-off via npx
npx whoiz google.com

# or install globally
npm i -g whoiz
whoiz google.com
```

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

```bash
whoiz cloudflare.com vercel.com github.com --tui
```

- `↑` / `↓` (or `j` / `k`) — switch domain
- `o` — open current domain on Spaceship
- `q` — quit

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

## How the lifecycle is interpreted

| State            | Meaning                                                                         |
| ---------------- | ------------------------------------------------------------------------------- |
| AVAILABLE        | TLD's whois says no record exists. Register link opens automatically.            |
| REGISTERED       | Active registration; expiry countdown shown.                                    |
| REDEMPTION       | `redemptionPeriod` set — owner can restore for a high fee, public can't grab.   |
| PENDING DELETE   | `pendingDelete` set — drop in ~5 days, then public registration opens.          |
| PENDING TRANSFER | `pendingTransfer` set — transfer in flight (~5 days).                           |
| HOLD             | `clientHold` / `serverHold` set — DNS suspended.                                |

## License

MIT © Ege Beşe
