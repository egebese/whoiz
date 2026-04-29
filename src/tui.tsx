import React, { useEffect, useState } from "react";
import { Box, Text, useApp, useInput, render } from "ink";
import TextInput from "ink-text-input";
import open from "open";
import type { DomainInfo } from "./types.js";
import { lookup } from "./lookup.js";
import { getStatusMeta } from "./status.js";
import { spaceshipSearchUrl, alternativeRegisterLinks } from "./affiliate.js";

interface Props {
  domains: string[];
}

interface Entry {
  id: number;
  domain: string;
  state: "loading" | "ready";
  info?: DomainInfo;
}

let nextId = 1;

function StateBadge({ info }: { info?: DomainInfo }) {
  if (!info) return <Text color="gray">…</Text>;
  switch (info.state) {
    case "available":
      return <Text backgroundColor="green" color="black"> AVAILABLE </Text>;
    case "registered":
      return <Text backgroundColor="blue" color="white"> REGISTERED </Text>;
    case "redemption":
      return <Text backgroundColor="yellow" color="black"> REDEMPTION </Text>;
    case "pending-delete":
      return <Text backgroundColor="magenta" color="white"> PENDING DELETE </Text>;
    case "pending-transfer":
      return <Text backgroundColor="cyan" color="black"> PENDING TRANSFER </Text>;
    case "hold":
      return <Text backgroundColor="red" color="white"> HOLD </Text>;
    default:
      return <Text backgroundColor="white" color="black"> UNKNOWN </Text>;
  }
}

function shortBadge(info?: DomainInfo) {
  if (!info) return "…";
  switch (info.state) {
    case "available":
      return "AVAIL";
    case "registered":
      return "REG";
    case "redemption":
      return "REDEMP";
    case "pending-delete":
      return "PDEL";
    case "pending-transfer":
      return "PXFR";
    case "hold":
      return "HOLD";
    default:
      return "?";
  }
}

function fmtDate(s?: string) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toISOString().slice(0, 10);
}

function Detail({ info }: { info?: DomainInfo }) {
  if (!info)
    return (
      <Text color="gray">looking up…</Text>
    );
  if (info.error && info.state === "unknown") {
    return <Text color="red">error: {info.error}</Text>;
  }
  if (info.state === "available") {
    return (
      <Box flexDirection="column">
        <Text color="green" bold>Available for registration</Text>
        <Box height={1} />
        <Text bold>Register at:</Text>
        {alternativeRegisterLinks(info.domain).map((l) => (
          <Text key={l.name}>
            <Text color={l.name === "Spaceship" ? "cyan" : undefined}>
              {"  "}{l.name.padEnd(12)}
            </Text>
            <Text>{l.url}</Text>
          </Text>
        ))}
        <Box height={1} />
        <Text dimColor>Press [o] to open Spaceship search in browser.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Box width={14}><Text dimColor>Registrar</Text></Box>
        <Text>{info.registrar ?? "—"}</Text>
      </Box>
      <Box>
        <Box width={14}><Text dimColor>Created</Text></Box>
        <Text>{fmtDate(info.createdDate)}</Text>
      </Box>
      <Box>
        <Box width={14}><Text dimColor>Updated</Text></Box>
        <Text>{fmtDate(info.updatedDate)}</Text>
      </Box>
      <Box>
        <Box width={14}><Text dimColor>Expires</Text></Box>
        <Text>
          {fmtDate(info.expiryDate)}{" "}
          {typeof info.daysToExpiry === "number" && (
            <Text color={info.daysToExpiry < 30 ? "yellow" : "gray"}>
              ({info.daysToExpiry}d)
            </Text>
          )}
        </Text>
      </Box>
      <Box>
        <Box width={14}><Text dimColor>Nameservers</Text></Box>
        <Box flexDirection="column">
          {info.nameServers.slice(0, 4).map((n) => (
            <Text key={n}>{n.toLowerCase()}</Text>
          ))}
          {info.nameServers.length > 4 && (
            <Text dimColor>+{info.nameServers.length - 4} more</Text>
          )}
        </Box>
      </Box>

      {info.statuses.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Status</Text>
          {(() => {
            const seen = new Set<string>();
            return info.statuses
              .map((s) => getStatusMeta(s))
              .filter((m) => (seen.has(m.code) ? false : (seen.add(m.code), true)))
              .map((meta) => {
                const color =
                  meta.severity === "good" ? "green" :
                  meta.severity === "warn" ? "yellow" :
                  meta.severity === "bad" ? "red" : "cyan";
                return (
                  <Box key={meta.code} flexDirection="column">
                    <Text>
                      <Text color={color}>● </Text>
                      <Text>{meta.code}</Text>
                      <Text dimColor>  {meta.label}</Text>
                    </Text>
                    <Text dimColor>    {meta.description}</Text>
                  </Box>
                );
              });
          })()}
        </Box>
      )}

      {info.periodLabel && (
        <Box flexDirection="column" marginTop={1}>
          <Text>
            <Text bold>Period: </Text>
            <Text>{info.periodLabel}</Text>
          </Text>
          {info.ownerAction && <Text dimColor>{info.ownerAction}</Text>}
          {info.estimatedAvailableDate && (
            <Text dimColor>
              ETA available: {fmtDate(info.estimatedAvailableDate)}
            </Text>
          )}
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Watch on Spaceship: </Text>
        <Text color="cyan">{spaceshipSearchUrl(info.domain)}</Text>
      </Box>
    </Box>
  );
}

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

function App({ domains }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { exit } = useApp();

  const startLookup = (domain: string) => {
    const id = nextId++;
    const entry: Entry = { id, domain, state: "loading" };
    setEntries((prev) => {
      const next = [entry, ...prev];
      setActive(0);
      return next;
    });
    lookup(domain).then((info) => {
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, state: "ready", info } : e)),
      );
    });
  };

  const submit = (raw: string) => {
    const tokens = raw
      .split(/[\s,]+/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (tokens.length === 0) {
      setError(null);
      return;
    }
    const valid = tokens.filter((t) => DOMAIN_RE.test(t));
    const invalid = tokens.filter((t) => !DOMAIN_RE.test(t));
    if (invalid.length > 0 && valid.length === 0) {
      setError(`not a valid domain: ${invalid.join(", ")}`);
      return;
    }
    setError(null);
    for (const d of valid) startLookup(d);
    setQuery("");
  };

  // Initial preloaded domains (from CLI args)
  useEffect(() => {
    for (const d of domains) startLookup(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useInput((input, key) => {
    if (key.ctrl && input === "c") exit();
    if (key.escape) exit();

    // navigation only when something is in the list
    if (entries.length > 0) {
      if (key.tab && !key.shift) {
        setActive((a) => (entries.length === 0 ? 0 : (a + 1) % entries.length));
      } else if (key.tab && key.shift) {
        setActive((a) => (entries.length === 0 ? 0 : (a - 1 + entries.length) % entries.length));
      } else if (key.ctrl && input === "o") {
        const cur = entries[active];
        if (cur?.info) open(spaceshipSearchUrl(cur.domain)).catch(() => {});
      } else if (key.ctrl && input === "d") {
        // delete current entry
        setEntries((prev) => {
          const next = prev.filter((_, i) => i !== active);
          setActive((a) => Math.max(0, Math.min(a, next.length - 1)));
          return next;
        });
      }
    }
  });

  const current = entries[active];

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text bold color="cyan">whoiz</Text>
        <Text dimColor>  type a domain and hit enter · multiple? separate by space or comma · esc to quit</Text>
      </Box>

      <Box marginTop={1} borderStyle="round" borderColor={error ? "red" : "cyan"} paddingX={1}>
        <Text color="cyan">❯ </Text>
        <TextInput
          value={query}
          onChange={(v) => {
            setQuery(v);
            if (error) setError(null);
          }}
          onSubmit={submit}
          placeholder="example.com or several space-separated…"
        />
      </Box>
      {error && <Text color="red">  {error}</Text>}

      {entries.length === 0 ? (
        <Box marginTop={1}>
          <Text dimColor>
            no lookups yet. try `claude.ai`, `cloudflare.com`, or several at once.
          </Text>
        </Box>
      ) : (
        <Box marginTop={1}>
          <Box flexDirection="column" width={28} marginRight={2}>
            <Text dimColor>history (Tab/Shift+Tab)</Text>
            {entries.map((e, i) => (
              <Box key={e.id}>
                <Text color={i === active ? "cyan" : undefined} bold={i === active}>
                  {i === active ? "▸ " : "  "}
                  {e.domain.length > 18 ? e.domain.slice(0, 17) + "…" : e.domain}
                </Text>
                <Text dimColor>
                  {"  "}{e.state === "loading" ? "…" : shortBadge(e.info)}
                </Text>
              </Box>
            ))}
          </Box>
          <Box flexDirection="column" flexGrow={1}>
            <Box marginBottom={1}>
              <Text bold>{current?.domain}</Text>
              <Text>  </Text>
              <StateBadge info={current?.info} />
            </Box>
            <Detail info={current?.info} />
          </Box>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          Tab/Shift+Tab switch · Ctrl+O open Spaceship · Ctrl+D drop entry · Esc quit
        </Text>
      </Box>
    </Box>
  );
}

export function startTui(domains: string[]) {
  // ensure a clean canvas — the previous prompt line is preserved by the host shell
  render(<App domains={domains} />);
}
