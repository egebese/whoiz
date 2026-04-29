import React, { useEffect, useState } from "react";
import { Box, Text, useApp, useInput, render } from "ink";
import open from "open";
import type { DomainInfo } from "./types.js";
import { lookup } from "./lookup.js";
import { getStatusMeta } from "./status.js";
import { spaceshipSearchUrl } from "./affiliate.js";

interface Props {
  domains: string[];
}

interface Entry {
  domain: string;
  state: "loading" | "ready";
  info?: DomainInfo;
}

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

function fmtDate(s?: string) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toISOString().slice(0, 10);
}

function Detail({ info }: { info?: DomainInfo }) {
  if (!info) return <Text color="gray">loading…</Text>;
  if (info.error && info.state === "unknown") {
    return <Text color="red">error: {info.error}</Text>;
  }
  if (info.state === "available") {
    return (
      <Box flexDirection="column">
        <Text color="green" bold>Available for registration</Text>
        <Box height={1} />
        <Text bold>Register at:</Text>
        <Text color="cyan">  Spaceship  {spaceshipSearchUrl(info.domain)}</Text>
        <Text dimColor>  Press [o] to open Spaceship search in browser.</Text>
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
          {info.statuses.map((s) => {
            const meta = getStatusMeta(s);
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
          })}
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

function App({ domains }: Props) {
  const [entries, setEntries] = useState<Entry[]>(
    domains.map((d) => ({ domain: d, state: "loading" })),
  );
  const [active, setActive] = useState(0);
  const { exit } = useApp();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let i = 0; i < domains.length; i++) {
        const info = await lookup(domains[i]!);
        if (cancelled) return;
        setEntries((prev) => {
          const next = [...prev];
          next[i] = { domain: domains[i]!, state: "ready", info };
          return next;
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [domains]);

  useInput((input, key) => {
    if (input === "q" || (key.ctrl && input === "c")) exit();
    if (key.downArrow || input === "j") setActive((a) => Math.min(a + 1, entries.length - 1));
    if (key.upArrow || input === "k") setActive((a) => Math.max(0, a - 1));
    if (input === "o") {
      const cur = entries[active];
      if (cur?.info) open(spaceshipSearchUrl(cur.domain)).catch(() => {});
    }
  });

  const current = entries[active];

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text bold>whoiz</Text>
        <Text dimColor>  ↑/↓ navigate · o open in browser · q quit</Text>
      </Box>
      <Box marginTop={1}>
        <Box flexDirection="column" width={28} marginRight={2}>
          {entries.map((e, i) => (
            <Box key={e.domain}>
              <Text color={i === active ? "cyan" : undefined} bold={i === active}>
                {i === active ? "▸ " : "  "}
                {e.domain}
              </Text>
              <Text dimColor>
                {"  "}
                {e.state === "loading" ? "…" : e.info?.state ?? ""}
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
    </Box>
  );
}

export function startTui(domains: string[]) {
  render(<App domains={domains} />);
}
