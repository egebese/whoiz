import meow from "meow";
import open from "open";
import pc from "picocolors";
import { lookup, lookupMany } from "./lookup.js";
import { renderDomain, renderJson } from "./render.js";
import { spaceshipSearchUrl } from "./links.js";
import { completionScript } from "./completion.js";
import { watchCmd, historyCmd, debugCmd } from "./subcommands.js";

const cli = meow(
  `
  ${pc.bold("Usage")}
    $ whoiz <domain> [<domain> …] [fields]
    $ whoiz watch <add|list|remove|status|tick|run|install|uninstall|doctor>
    $ whoiz history <domain>

  ${pc.bold("Options")}
    --tui              Interactive TUI mode (ink)
    --json             Output JSON (machine readable)
    --no-open          Don't auto-open Spaceship when a domain is available
    --register, -r     Force-open Spaceship for the first domain
    --fields, -f       Comma-separated field list (alt to positional fields)
    --watch, -w        Re-poll on interval and redraw in place (foreground)
    --interval, -i     Foreground watch interval in seconds (default 60)
    --concurrency, -c  Parallelism for bulk lookups (default 4)
    --timeout, -t      Per-domain timeout ms (default 8000)
    --completion       Print shell completion script (bash|zsh|fish)
    --version, -v
    --help

  ${pc.bold("Fields")}
    status, period, expiry, created, updated, registrar, ns, dnssec, links, raw

  ${pc.bold("Examples")}
    $ whoiz google.com
    $ whoiz google.com status,period
    $ whoiz watch add mydomain.com         ${pc.dim("# adaptive background polling")}
    $ whoiz watch list
    $ whoiz history mydomain.com           ${pc.dim("# diff history of registrar/ns/state")}
`,
  {
    importMeta: import.meta,
    flags: {
      tui: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      open: { type: "boolean", default: true },
      register: { type: "boolean", shortFlag: "r", default: false },
      fields: { type: "string", shortFlag: "f" },
      watch: { type: "boolean", shortFlag: "w", default: false },
      interval: { type: "number", shortFlag: "i", default: 60 },
      concurrency: { type: "number", shortFlag: "c", default: 4 },
      timeout: { type: "number", shortFlag: "t", default: 8000 },
      completion: { type: "string" },
    },
  },
);

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

function looksLikeDomain(s: string): boolean {
  return DOMAIN_RE.test(s);
}

function parseArgs(input: string[]): { domains: string[]; fields: string[] } {
  const domains: string[] = [];
  const fields: string[] = [];
  for (const arg of input) {
    if (looksLikeDomain(arg)) {
      domains.push(arg.toLowerCase());
    } else {
      // treat as field token group: "status,period" or "status/period"
      for (const part of arg.split(/[,/\s]+/).filter(Boolean)) fields.push(part);
    }
  }
  return { domains, fields };
}

async function renderAll(
  domains: string[],
  fields: string[],
  json: boolean,
  concurrency: number,
  timeout: number,
): Promise<{ available: string[] }> {
  const infos =
    domains.length === 1
      ? [await lookup(domains[0]!, timeout)]
      : await lookupMany(domains, concurrency, timeout);

  if (json) {
    if (infos.length === 1) process.stdout.write(renderJson(infos[0]!) + "\n");
    else
      process.stdout.write(
        JSON.stringify(infos.map((i) => JSON.parse(renderJson(i))), null, 2) + "\n",
      );
    return { available: infos.filter((i) => i.state === "available").map((i) => i.domain) };
  }

  const available: string[] = [];
  for (let i = 0; i < infos.length; i++) {
    const info = infos[i]!;
    process.stdout.write(renderDomain(info, { fields }) + "\n");
    if (i < infos.length - 1) process.stdout.write("\n");
    if (info.state === "available") available.push(info.domain);
  }
  return { available };
}

function clearScreen() {
  process.stdout.write("\x1b[2J\x1b[H");
}

async function main() {
  if (cli.flags.completion !== undefined) {
    const shell = (cli.flags.completion || cli.input[0] || "").toLowerCase();
    const script = completionScript(shell);
    if (!script) {
      process.stderr.write(`whoiz: --completion requires bash | zsh | fish\n`);
      process.exit(2);
    }
    process.stdout.write(script);
    return;
  }

  // Subcommand dispatch — has to happen before parseArgs since these aren't domains.
  if (cli.input[0] === "watch") {
    process.exit(await watchCmd(cli.input.slice(1)));
  }
  if (cli.input[0] === "history") {
    process.exit(historyCmd(cli.input.slice(1)));
  }
  if (cli.input[0] === "debug") {
    process.exit(debugCmd(cli.input.slice(1)));
  }

  const { domains, fields: posFields } = parseArgs(cli.input);
  const flagFields = cli.flags.fields
    ? cli.flags.fields.split(/[,/\s]+/).filter(Boolean)
    : [];
  const fields = [...new Set([...posFields, ...flagFields])];

  // Bare `whoiz` (no domains and no register flag) → launch interactive TUI.
  // Use --help to see usage. --tui works the same way, just explicit.
  if (cli.flags.tui || (domains.length === 0 && !cli.flags.register)) {
    if (!process.stdin.isTTY) {
      // No interactive TTY available — bail out helpfully instead of crashing.
      if (domains.length === 0) {
        cli.showHelp(0);
        return;
      }
      // domains were piped in with --tui flag; fall through to non-TUI render
      cli.flags.tui = false;
    } else {
      const { startTui } = await import("./tui.js");
      startTui(domains);
      return;
    }
  }

  if (cli.flags.register && domains[0]) {
    const url = spaceshipSearchUrl(domains[0]);
    process.stdout.write(`${pc.cyan("Opening Spaceship search for")} ${pc.bold(domains[0])}\n${url}\n`);
    await open(url).catch(() => {});
    return;
  }

  if (cli.flags.watch) {
    const intervalMs = Math.max(5, cli.flags.interval) * 1000;
    let stop = false;
    process.on("SIGINT", () => {
      stop = true;
      process.stdout.write("\n");
      process.exit(0);
    });
    while (!stop) {
      clearScreen();
      const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
      process.stdout.write(pc.dim(`whoiz watch · ${ts} · every ${cli.flags.interval}s · Ctrl+C to stop`) + "\n\n");
      await renderAll(domains, fields, cli.flags.json, cli.flags.concurrency, cli.flags.timeout);
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return;
  }

  const { available } = await renderAll(
    domains,
    fields,
    cli.flags.json,
    cli.flags.concurrency,
    cli.flags.timeout,
  );

  if (cli.flags.open && !cli.flags.json) {
    for (const d of available) {
      const url = spaceshipSearchUrl(d);
      process.stdout.write(
        `\n${pc.green("➜")} Opening Spaceship search: ${pc.underline(url)}\n`,
      );
      await open(url).catch(() => {});
    }
  }
}

main().catch((err) => {
  process.stderr.write(pc.red(`whoiz error: ${err?.message ?? err}\n`));
  process.exit(1);
});
