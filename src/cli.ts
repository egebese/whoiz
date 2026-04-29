import meow from "meow";
import open from "open";
import pc from "picocolors";
import { lookup, lookupMany } from "./lookup.js";
import { renderDomain, renderJson } from "./render.js";
import { spaceshipSearchUrl } from "./affiliate.js";

const cli = meow(
  `
  ${pc.bold("Usage")}
    $ whoiz <domain> [<domain> …] [fields]
    $ whoiz <domain> status,period
    $ whoiz <domain> status/period         (slash also accepted)

  ${pc.bold("Options")}
    --tui              Interactive TUI mode (ink)
    --json             Output JSON (machine readable)
    --no-open          Don't auto-open Spaceship when a domain is available
    --register, -r     Force-open Spaceship for the first domain
    --fields, -f       Comma-separated field list (alt to positional fields)
    --concurrency, -c  Parallelism for bulk lookups (default 4)
    --timeout, -t      Per-domain timeout ms (default 8000)
    --version, -v
    --help

  ${pc.bold("Fields")}
    status, period, expiry, created, updated, registrar, ns, dnssec, links, raw

  ${pc.bold("Examples")}
    $ whoiz google.com
    $ whoiz google.com cloudflare.com expired-domain.shop
    $ whoiz google.com status,period
    $ whoiz somenewname.io --no-open
    $ whoiz google.com --json
`,
  {
    importMeta: import.meta,
    flags: {
      tui: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      open: { type: "boolean", default: true },
      register: { type: "boolean", shortFlag: "r", default: false },
      fields: { type: "string", shortFlag: "f" },
      concurrency: { type: "number", shortFlag: "c", default: 4 },
      timeout: { type: "number", shortFlag: "t", default: 8000 },
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

async function main() {
  const { domains, fields: posFields } = parseArgs(cli.input);
  const flagFields = cli.flags.fields
    ? cli.flags.fields.split(/[,/\s]+/).filter(Boolean)
    : [];
  const fields = [...new Set([...posFields, ...flagFields])];

  if (domains.length === 0) {
    cli.showHelp(0);
    return;
  }

  if (cli.flags.tui) {
    const { startTui } = await import("./tui.js");
    startTui(domains);
    return;
  }

  if (cli.flags.register && domains[0]) {
    const url = spaceshipSearchUrl(domains[0]);
    process.stdout.write(`${pc.cyan("Opening Spaceship search for")} ${pc.bold(domains[0])}\n${url}\n`);
    await open(url).catch(() => {});
    return;
  }

  const infos =
    domains.length === 1
      ? [await lookup(domains[0]!, cli.flags.timeout)]
      : await lookupMany(domains, cli.flags.concurrency, cli.flags.timeout);

  if (cli.flags.json) {
    if (infos.length === 1) process.stdout.write(renderJson(infos[0]!) + "\n");
    else
      process.stdout.write(
        JSON.stringify(infos.map((i) => JSON.parse(renderJson(i))), null, 2) + "\n",
      );
    return;
  }

  for (let i = 0; i < infos.length; i++) {
    const info = infos[i]!;
    process.stdout.write(renderDomain(info, { fields }) + "\n");
    if (i < infos.length - 1) process.stdout.write("\n");

    if (info.state === "available" && cli.flags.open) {
      const url = spaceshipSearchUrl(info.domain);
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
