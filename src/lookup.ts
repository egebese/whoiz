import whoiser from "whoiser";
import type { DomainInfo, DomainState } from "./types.js";

/** Pick the most useful entry from whoiser's multi-server response. */
function pickEntry(data: Record<string, any>): Record<string, any> | null {
  const entries = Object.entries(data).filter(([k]) => !k.startsWith("__"));
  if (entries.length === 0) return null;

  // Prefer the entry that actually has parsed fields (not just "text")
  const scored = entries
    .map(([k, v]) => {
      if (!v || typeof v !== "object") return { k, v, score: -1 };
      const keys = Object.keys(v);
      const hasParsed = keys.some(
        (kk) => kk !== "text" && kk !== "error" && v[kk] != null && v[kk] !== "",
      );
      const score = (hasParsed ? 100 : 0) + keys.length;
      return { k, v, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.v ?? null;
}

function firstString(...vals: any[]): string | undefined {
  for (const v of vals) {
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") return v[0];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function asArray(v: any): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

function isAvailableText(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("no match for") ||
    t.includes("not found") ||
    t.includes("no entries found") ||
    t.includes("no data found") ||
    t.includes("status: free") ||
    t.includes("status: available") ||
    t.includes("domain not found") ||
    /no\s+object\s+found/.test(t)
  );
}

function deriveState(statuses: string[], rawText: string, hasFields: boolean): DomainState {
  const codes = statuses.map((s) => s.split(/\s+/)[0]?.toLowerCase() ?? "");

  if (codes.some((c) => c === "redemptionperiod")) return "redemption";
  if (codes.some((c) => c === "pendingdelete")) return "pending-delete";
  if (codes.some((c) => c === "pendingtransfer")) return "pending-transfer";
  if (codes.some((c) => c === "clienthold" || c === "serverhold")) return "hold";

  if (!hasFields && isAvailableText(rawText)) return "available";
  if (hasFields) return "registered";
  return "unknown";
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function tldOf(domain: string): string {
  const parts = domain.toLowerCase().split(".");
  return parts.slice(1).join(".") || domain;
}

function describePeriod(info: DomainInfo): { label?: string; ownerAction?: string; eta?: string } {
  const codes = info.statuses.map((s) => s.split(/\s+/)[0]);
  const now = new Date();

  if (codes.includes("pendingDelete")) {
    const eta = new Date(now.getTime() + 5 * 86400_000).toISOString();
    return {
      label: "Pending Delete (~5 days until public drop)",
      ownerAction:
        "Owner cannot restore in this phase. Domain will be released to the public registry.",
      eta,
    };
  }

  if (codes.includes("redemptionPeriod")) {
    // ~30 days from when redemption started; we don't know exact start, so estimate
    // from expiry + 30d (typical: 0–45d auto-renew → 30d redemption → 5d pendingDelete)
    if (info.expiryDate) {
      const exp = new Date(info.expiryDate);
      const eta = new Date(exp.getTime() + (45 + 30 + 5) * 86400_000).toISOString();
      return {
        label: "Redemption Period (~30 days)",
        ownerAction:
          "Original owner can restore via their registrar for a redemption fee (~$80–150). Not registerable by others.",
        eta,
      };
    }
    return {
      label: "Redemption Period (~30 days)",
      ownerAction:
        "Original owner can restore via their registrar for a redemption fee (~$80–150). Not registerable by others.",
    };
  }

  if (info.state === "registered" && typeof info.daysToExpiry === "number") {
    const d = info.daysToExpiry;
    if (d < 0) {
      return {
        label: `Expired ${Math.abs(d)} days ago — likely in auto-renew/redemption pipeline`,
        ownerAction: "Renew now via the current registrar; restoration cost rises after redemption.",
      };
    }
    if (d <= 30)
      return {
        label: `Expires in ${d} days`,
        ownerAction: "Renew soon to avoid grace-period and redemption fees.",
      };
    return { label: `Active — expires in ${d} days` };
  }

  if (info.state === "available") {
    return {
      label: "Available for registration",
      ownerAction: "Register now via Spaceship (link below).",
    };
  }

  return {};
}

export async function lookup(domain: string, timeoutMs = 8000): Promise<DomainInfo> {
  const tld = tldOf(domain);
  const base: DomainInfo = {
    domain,
    tld,
    state: "unknown",
    statuses: [],
    nameServers: [],
  };

  try {
    const res = (await whoiser(domain, { timeout: timeoutMs, follow: 2 })) as Record<string, any>;
    const entry = pickEntry(res);
    const rawText = entry?.text
      ? Array.isArray(entry.text)
        ? entry.text.join("\n")
        : String(entry.text)
      : "";

    if (!entry) {
      base.state = "unknown";
      base.error = "no whois response";
      return base;
    }

    const statuses = asArray(entry["Domain Status"]);
    const nameServers = asArray(entry["Name Server"]);
    const registrar = firstString(entry["Registrar"], entry["Sponsoring Registrar"]);
    const registrarUrl = firstString(entry["Registrar URL"]);
    const registrarIanaId = firstString(entry["Registrar IANA ID"]);
    const whoisServer = firstString(entry["Registrar WHOIS Server"], entry["WHOIS Server"]);
    const createdDate = firstString(entry["Created Date"], entry["Creation Date"], entry["Registered On"]);
    const updatedDate = firstString(entry["Updated Date"], entry["Last Updated"]);
    const expiryDate = firstString(
      entry["Expiry Date"],
      entry["Registry Expiry Date"],
      entry["Registrar Registration Expiration Date"],
      entry["Expires On"],
      entry["Expiration Date"],
    );
    const dnssec = firstString(entry["DNSSEC"]);

    const hasFields = Boolean(registrar || createdDate || expiryDate || statuses.length > 0);

    base.statuses = statuses;
    base.nameServers = nameServers;
    base.registrar = registrar;
    base.registrarUrl = registrarUrl;
    base.registrarIanaId = registrarIanaId;
    base.whoisServer = whoisServer;
    base.createdDate = createdDate;
    base.updatedDate = updatedDate;
    base.expiryDate = expiryDate;
    base.dnssec = dnssec;
    base.raw = rawText.slice(0, 4000);

    if (expiryDate) {
      const d = new Date(expiryDate);
      if (!Number.isNaN(d.getTime())) base.daysToExpiry = daysBetween(d, new Date());
    }

    base.state = deriveState(statuses, rawText, hasFields);

    const desc = describePeriod(base);
    base.periodLabel = desc.label;
    base.ownerAction = desc.ownerAction;
    base.estimatedAvailableDate = desc.eta;

    return base;
  } catch (err) {
    base.error = err instanceof Error ? err.message : String(err);
    return base;
  }
}

export async function lookupMany(
  domains: string[],
  concurrency = 4,
  timeoutMs = 8000,
): Promise<DomainInfo[]> {
  const results: DomainInfo[] = new Array(domains.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, domains.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= domains.length) return;
      results[i] = await lookup(domains[i]!, timeoutMs);
    }
  });
  await Promise.all(workers);
  return results;
}
