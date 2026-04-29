import { spawn } from "node:child_process";
import type { DomainInfo } from "./types.js";

/**
 * Fallback that shells out to the system `whois` binary. We only invoke this
 * when whoiser comes back empty or unknown — many ccTLDs return data the
 * system tool understands but whoiser doesn't fully parse.
 */
export function runSystemWhois(domain: string, timeoutMs = 8000): Promise<string | null> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const settle = (v: string | null) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };

    let child;
    try {
      child = spawn("whois", [domain], { stdio: ["ignore", "pipe", "pipe"] });
    } catch {
      return settle(null);
    }

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      settle(null);
    }, timeoutMs);

    child.stdout.on("data", (b) => (stdout += b.toString("utf8")));
    child.stderr.on("data", (b) => (stderr += b.toString("utf8")));
    child.on("error", () => {
      clearTimeout(timer);
      settle(null);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      // Some whois implementations exit non-zero on "not found"; we still want
      // the body. Resolve null only if there's nothing usable.
      const text = stdout || stderr;
      settle(text.length > 20 ? text : null);
    });
  });
}

const PATTERNS = {
  registrar: [
    /(?:Sponsoring\s+)?Registrar(?:\s+Name)?\s*:\s*(.+)/i,
    /Registration\s+Service\s+Provider\s*:\s*(.+)/i,
  ],
  registrarUrl: [/Registrar\s+URL\s*:\s*(.+)/i],
  whoisServer: [/(?:Registrar\s+)?WHOIS\s+Server\s*:\s*(.+)/i],
  created: [
    /Creation\s+Date\s*:\s*(.+)/i,
    /Created(?:\s+On)?\s*:\s*(.+)/i,
    /Registered(?:\s+on)?\s*:\s*(.+)/i,
    /Domain\s+Registration\s+Date\s*:\s*(.+)/i,
  ],
  updated: [
    /Updated\s+Date\s*:\s*(.+)/i,
    /Last\s+Updated\s*:\s*(.+)/i,
    /Last\s+Modified\s*:\s*(.+)/i,
    /Changed\s*:\s*(.+)/i,
  ],
  expiry: [
    /(?:Registry\s+)?Expir[ye](?:\s+Date|\s+On)?\s*:\s*(.+)/i,
    /Registrar\s+Registration\s+Expiration\s+Date\s*:\s*(.+)/i,
    /Expires\s+On\s*:\s*(.+)/i,
    /Expiration\s+Date\s*:\s*(.+)/i,
    /paid-till\s*:\s*(.+)/i,
  ],
  dnssec: [/DNSSEC\s*:\s*(.+)/i, /signing-key\s*:\s*(.+)/i],
};

const STATUS_PATTERNS = [
  /(?:Domain\s+)?Status\s*:\s*(.+)/gi,
  /^status:\s*(.+)/gim, // .nl, .de short form
];
const NS_PATTERNS = [
  /Name\s+Server(?:s)?\s*:\s*(.+)/gi,
  /^nserver:\s*(.+)/gim, // .ru, .de
  /^nameservers?:\s*(.+)/gim,
];

const FREE_TEXT = [
  /no\s+match\s+for/i,
  /not\s+found/i,
  /no\s+entries\s+found/i,
  /no\s+data\s+found/i,
  /^status:\s*free\b/im,
  /^status:\s*available\b/im,
  /domain\s+not\s+found/i,
  /no\s+object\s+found/i,
  /this\s+domain\s+name\s+has\s+not\s+been\s+registered/i,
];

function firstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1]) return m[1].trim();
  }
  return undefined;
}

function allMatches(text: string, patterns: RegExp[]): string[] {
  const out = new Set<string>();
  for (const p of patterns) {
    let m: RegExpExecArray | null;
    const re = new RegExp(p.source, p.flags);
    while ((m = re.exec(text)) !== null) {
      const v = m[1]?.trim();
      if (v) out.add(v);
    }
  }
  return Array.from(out);
}

/**
 * Parse the raw output of system `whois` into partial DomainInfo fields.
 * Returns null if the text is clearly a "not found" / available signal.
 */
export function parseSystemWhois(text: string): Partial<DomainInfo> & { available?: boolean } {
  const isAvailable = FREE_TEXT.some((re) => re.test(text));

  return {
    available: isAvailable || undefined,
    registrar: firstMatch(text, PATTERNS.registrar),
    registrarUrl: firstMatch(text, PATTERNS.registrarUrl),
    whoisServer: firstMatch(text, PATTERNS.whoisServer),
    createdDate: firstMatch(text, PATTERNS.created),
    updatedDate: firstMatch(text, PATTERNS.updated),
    expiryDate: firstMatch(text, PATTERNS.expiry),
    dnssec: firstMatch(text, PATTERNS.dnssec),
    statuses: allMatches(text, STATUS_PATTERNS),
    nameServers: allMatches(text, NS_PATTERNS).map((s) => s.split(/\s+/)[0]!),
  };
}
