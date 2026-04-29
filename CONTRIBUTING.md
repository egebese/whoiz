# Contributing to whoiz

Thanks for considering a contribution. `whoiz` is a small, focused CLI — most
PRs are welcome but the bar is "does it stay focused, fast, and pretty in a
terminal." Read this first; it'll save us both a round-trip.

## Quick start

```bash
git clone https://github.com/egebese/whoiz.git
cd whoiz
npm install
npm run build       # tsc once
npm run dev         # tsc --watch (use this while hacking)
node bin/whoiz.js google.com
```

To test changes globally on your shell:

```bash
npm link            # makes `whoiz` resolve to your working tree
whoiz cloudflare.com
npm unlink -g whoiz # when done
```

## Project layout

```
src/
├── cli.ts        meow-based arg parsing; entry point
├── lookup.ts     whoiser wrapper → normalized DomainInfo
├── status.ts     EPP status code table + lookup
├── render.ts     non-TUI box renderer (picocolors)
├── tui.tsx       Ink-based interactive TUI
├── affiliate.ts  Spaceship + alt-registrar URL builders
└── types.ts      shared types

bin/whoiz.js      shim that imports dist/cli.js
dist/             tsc output (gitignored)
```

A few load-bearing rules:

- `src/cli.ts` is the only place that reads CLI flags. Don't reach into
  `process.argv` from elsewhere.
- `lookup.ts` returns a `DomainInfo`; `render.ts` and `tui.tsx` consume it.
  Keep parsing/networking out of the renderers.
- The CLI renderer must work when piped (no TTY). The TUI must work only when
  stdin is a TTY (see the guard in `cli.ts`).

## What makes a good PR

Welcome:

- New EPP status code with a clear, source-cited description (link the ICANN
  page or registry doc in the PR).
- TLD-specific quirks in the parser (some ccTLDs return weird date formats /
  status codes — fix one with a real example in the PR description).
- Render tweaks that improve clarity at common widths (80/100/120 cols).
- New `--field` keyword (with one-liner doc + alias).
- Better `available` detection for TLDs that don't say "No match for".

Not a fit (please open an issue first to discuss):

- New top-level commands or modes beyond `whoiz <domain>` and `--tui`.
- Adding a heavyweight dependency (we keep deps small — picocolors over chalk,
  meow over commander, no lodash).
- Changes to which registrar is shown first in the available-domain panel —
  Spaceship is the default sponsor of this CLI; alt-registrars stay listed but
  the order is opinionated.
- Telemetry, analytics, or anything that calls home.

## Style

- TypeScript strict mode is on. Keep it on.
- ESM only — `.js` extensions in relative imports (`./lookup.js`), even from
  `.ts` source. That's how Node's ESM resolver wants it.
- No `any` unless you really mean it (the whoiser response is the one
  legitimate place — it's typed loosely upstream).
- No comments that just describe what code does. Comments explain *why* —
  hidden constraints, non-obvious tradeoffs, registry quirks.
- Run `npm run build` before pushing; CI is just `tsc`, so a green local
  build = green CI.

## Testing your change

We don't ship a unit-test suite (whois is network-bound and brittle to mock
well). Instead, before opening a PR, run a few real lookups that exercise the
code path you touched:

```bash
# active, with full status set
node bin/whoiz.js google.com

# an io domain (Identity Digital, different parser path)
node bin/whoiz.js claude.io

# explicitly available
node bin/whoiz.js asdkfjasldkfjqweoiruzxcvbnm123.com --no-open

# bulk + field query
node bin/whoiz.js cloudflare.com vercel.com github.com status,period

# JSON output
node bin/whoiz.js github.com --json | jq

# TUI (must be in a real terminal)
node bin/whoiz.js --tui
```

In the PR description, paste the relevant slice of output before/after. That
makes review fast.

## Releasing (maintainers only)

1. Bump version in `package.json` (`npm version patch|minor|major` — that
   creates a tag too).
2. `git push --follow-tags`.
3. `npm publish --access public` (the `prepublishOnly` script runs `tsc`).
4. Open a GitHub Release for the tag with a short changelog.

Use [semver](https://semver.org). User-visible CLI flag changes are minor;
output-format changes that break scripts are also minor (we're pre-1.0; on or
after 1.0 they become major).

## Reporting issues

When filing a bug, include:

- `whoiz --version`
- `node --version`
- The exact command you ran
- The full output (or a screenshot if it's a TUI rendering issue)
- For parser bugs: `whoiz <domain> --json` so we can see what made it through

## Code of conduct

Be decent. Don't waste contributors' time. Reviews are technical, not personal.

## License

By contributing you agree that your contributions are licensed under the MIT
license, the same as the rest of the project.
