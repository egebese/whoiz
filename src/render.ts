import pc from "picocolors";
import stringWidth from "string-width";
import type { DomainInfo } from "./types.js";
import { getStatusMeta } from "./status.js";
import { alternativeRegisterLinks, spaceshipSearchUrl, spaceshipTransferUrl } from "./links.js";

const TERM_COLS = Math.max(60, Math.min(process.stdout.columns ?? 100, 110));
const BOX_WIDTH = TERM_COLS;

function ralign(s: string, w: number): string {
  const pad = Math.max(0, w - stringWidth(s));
  return " ".repeat(pad) + s;
}
function lpad(s: string, w: number): string {
  const pad = Math.max(0, w - stringWidth(s));
  return s + " ".repeat(pad);
}

function stateBadge(info: DomainInfo): string {
  switch (info.state) {
    case "available":
      return pc.bgGreen(pc.black(" AVAILABLE "));
    case "registered":
      return pc.bgBlue(pc.white(" REGISTERED "));
    case "redemption":
      return pc.bgYellow(pc.black(" REDEMPTION "));
    case "pending-delete":
      return pc.bgMagenta(pc.white(" PENDING DELETE "));
    case "pending-transfer":
      return pc.bgCyan(pc.black(" PENDING TRANSFER "));
    case "expired":
      return pc.bgRed(pc.white(" EXPIRED "));
    case "hold":
      return pc.bgRed(pc.white(" HOLD "));
    default:
      return pc.bgWhite(pc.black(" UNKNOWN "));
  }
}

function severityIcon(sev: string): string {
  switch (sev) {
    case "good":
      return pc.green("✓");
    case "warn":
      return pc.yellow("⚠");
    case "bad":
      return pc.red("✗");
    default:
      return pc.cyan("•");
  }
}

function fmtDate(s?: string): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const iso = d.toISOString().slice(0, 10);
  const now = new Date();
  const diffDays = Math.round((d.getTime() - now.getTime()) / 86400_000);
  return `${iso}  ${pc.dim(`(${humanDelta(diffDays)})`)}`;
}

function humanDelta(days: number): string {
  if (days === 0) return "today";
  const abs = Math.abs(days);
  const sign = days < 0 ? "ago" : "from now";
  if (abs < 60) return `${abs}d ${sign}`;
  if (abs < 730) {
    const m = Math.round(abs / 30);
    return `${m}mo ${sign}`;
  }
  const y = Math.floor(abs / 365);
  const r = Math.round((abs - y * 365) / 30);
  return r > 0 ? `${y}y ${r}mo ${sign}` : `${y}y ${sign}`;
}

function topBorder(title: string, badge: string): string {
  // ╭─ title ─── BADGE ─╮
  const left = `╭─ ${pc.bold(title)} `;
  const right = ` ${badge} ─╮`;
  const visible = stringWidth(left) + stringWidth(right);
  const fill = "─".repeat(Math.max(0, BOX_WIDTH - visible));
  return left + fill + right;
}

function bottomBorder(): string {
  return "╰" + "─".repeat(BOX_WIDTH - 2) + "╯";
}

function row(text: string): string {
  // text may contain ANSI color codes; pad based on visible width
  const inner = BOX_WIDTH - 4;
  let body = text;
  let visible = stringWidth(body);
  if (visible > inner) {
    // hard-truncate while preserving the ANSI prefix; safer to just slice raw
    body = body.slice(0, inner);
    visible = stringWidth(body);
  }
  const pad = Math.max(0, inner - visible);
  return `│ ${body}${" ".repeat(pad)} │`;
}

function emptyRow(): string {
  return "│" + " ".repeat(BOX_WIDTH - 2) + "│";
}

function kv(label: string, value: string): string {
  const labelW = 14;
  return row(`${pc.dim(lpad(label, labelW))} ${value}`);
}

function truncList(items: string[], max = 3): string {
  if (items.length === 0) return pc.dim("—");
  if (items.length <= max) return items.join(", ");
  return items.slice(0, max).join(", ") + pc.dim(`, +${items.length - max} more`);
}

interface RenderOptions {
  fields?: string[];
}

const FIELD_ALIASES: Record<string, string> = {
  status: "status",
  statuses: "status",
  state: "state",
  period: "period",
  expiry: "expiry",
  expires: "expiry",
  expiration: "expiry",
  created: "created",
  registered: "created",
  updated: "updated",
  registrar: "registrar",
  ns: "ns",
  nameservers: "ns",
  nameserver: "ns",
  dnssec: "dnssec",
  raw: "raw",
  links: "links",
  register: "links",
};

function normFields(fields?: string[]): Set<string> | null {
  if (!fields || fields.length === 0) return null;
  const out = new Set<string>();
  for (const f of fields) {
    const key = FIELD_ALIASES[f.toLowerCase()];
    if (key) out.add(key);
  }
  return out;
}

export function renderDomain(info: DomainInfo, opts: RenderOptions = {}): string {
  const fields = normFields(opts.fields);
  const want = (k: string) => !fields || fields.has(k);

  const lines: string[] = [];
  lines.push(topBorder(info.domain, stateBadge(info)));

  if (info.error && info.state === "unknown") {
    lines.push(row(pc.red(`error: ${info.error}`)));
    lines.push(bottomBorder());
    return lines.join("\n");
  }

  if (info.state === "available") {
    lines.push(row(`${pc.dim(lpad("Status", 14))} ${pc.green("Available for registration")}`));
    lines.push(row(`${pc.dim(lpad("TLD", 14))} .${info.tld}`));
    lines.push(bottomBorder());
    // Links are printed outside the box so URLs stay clickable in full.
    lines.push("");
    lines.push(pc.bold("Register at:"));
    for (const link of alternativeRegisterLinks(info.domain)) {
      const isSpaceship = link.name === "Spaceship";
      const name = isSpaceship ? pc.cyan(pc.bold(link.name)) : link.name;
      lines.push(`  ${severityIcon("info")} ${lpad(name, 12)}  ${pc.underline(link.url)}`);
    }
    return lines.join("\n");
  }

  // Registered / pending / hold / redemption — show full data
  if (want("registrar") && info.registrar) lines.push(kv("Registrar", info.registrar));
  if (want("created") && info.createdDate) lines.push(kv("Created", fmtDate(info.createdDate)));
  if (want("updated") && info.updatedDate) lines.push(kv("Updated", fmtDate(info.updatedDate)));
  if (want("expiry") && info.expiryDate) lines.push(kv("Expires", fmtDate(info.expiryDate)));
  if (want("ns") && info.nameServers.length > 0)
    lines.push(kv("Nameservers", truncList(info.nameServers.map((n) => n.toLowerCase()))));
  if (want("dnssec") && info.dnssec) lines.push(kv("DNSSEC", info.dnssec));

  if (want("status") && info.statuses.length > 0) {
    lines.push(emptyRow());
    lines.push(row(pc.bold("Status")));
    // de-duplicate by canonical code
    const seen = new Set<string>();
    const ordered = info.statuses
      .map((s) => getStatusMeta(s))
      .filter((m) => (seen.has(m.code) ? false : (seen.add(m.code), true)));
    for (const meta of ordered) {
      const head = `  ${severityIcon(meta.severity)} ${lpad(meta.code, 30)}`;
      const desc = pc.dim(meta.label);
      // first line: code + label
      lines.push(row(`${head} ${desc}`));
      // wrap description
      const wrapped = wrapText(meta.description, BOX_WIDTH - 4 - 35);
      for (const w of wrapped) {
        lines.push(row(`${" ".repeat(35)}${pc.dim(w)}`));
      }
    }
  }

  if (want("period") && info.periodLabel) {
    lines.push(emptyRow());
    lines.push(row(`${pc.bold("Period:")} ${periodColor(info)(info.periodLabel)}`));
    if (info.ownerAction) {
      const wrapped = wrapText(info.ownerAction, BOX_WIDTH - 4);
      for (const w of wrapped) lines.push(row(pc.dim(w)));
    }
    if (info.estimatedAvailableDate) {
      lines.push(row(pc.dim(`ETA available: ${fmtDate(info.estimatedAvailableDate)}`)));
    }
  }

  if (want("links") || fields?.has("links")) {
    const fmtUrl = (head: string, url: string) => {
      const headW = stringWidth(head);
      const avail = BOX_WIDTH - 4 - headW;
      const urlOut = stringWidth(url) <= avail ? pc.underline(url) : pc.underline(url.slice(0, avail - 1) + "…");
      return row(head + urlOut);
    };
    lines.push(emptyRow());
    lines.push(row(pc.bold("Watch / register on drop:")));
    lines.push(fmtUrl(`  ${pc.cyan("Spaceship")}  `, spaceshipSearchUrl(info.domain)));
    lines.push(emptyRow());
    lines.push(row(pc.bold("Transfer to Spaceship:")));
    lines.push(fmtUrl(`  ${pc.cyan("Transfer ")}  `, spaceshipTransferUrl(info.domain)));
  }

  if (fields?.has("raw") && info.raw) {
    lines.push(emptyRow());
    lines.push(row(pc.bold("Raw whois (truncated)")));
    for (const w of info.raw.split("\n").slice(0, 30)) {
      lines.push(row(pc.dim(w.slice(0, BOX_WIDTH - 4))));
    }
  }

  lines.push(bottomBorder());
  return lines.join("\n");
}

function periodColor(info: DomainInfo): (s: string) => string {
  if (info.state === "redemption") return pc.yellow;
  if (info.state === "pending-delete") return pc.magenta;
  if (info.state === "hold") return pc.red;
  if (info.state === "registered" && (info.daysToExpiry ?? 999) < 30) return pc.yellow;
  return pc.green;
}

function wrapText(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    if (stringWidth(line) + stringWidth(w) + 1 > width) {
      if (line) out.push(line);
      line = w;
    } else {
      line = line ? line + " " + w : w;
    }
  }
  if (line) out.push(line);
  return out;
}

export function renderJson(info: DomainInfo): string {
  const { raw, ...rest } = info;
  return JSON.stringify(rest, null, 2);
}
