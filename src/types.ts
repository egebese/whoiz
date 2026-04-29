export type DomainState =
  | "available"
  | "registered"
  | "redemption"
  | "pending-delete"
  | "pending-transfer"
  | "expired"
  | "hold"
  | "unknown";

export interface DomainInfo {
  domain: string;
  tld: string;
  state: DomainState;
  registrar?: string;
  registrarUrl?: string;
  registrarIanaId?: string;
  whoisServer?: string;
  createdDate?: string;
  updatedDate?: string;
  expiryDate?: string;
  /** Days until expiry (negative if past) */
  daysToExpiry?: number;
  /** When the domain becomes available again, if in redemption/pendingDelete */
  estimatedAvailableDate?: string;
  /** EPP status codes (as returned by registry) */
  statuses: string[];
  nameServers: string[];
  dnssec?: string;
  /** When in redemption etc, what owner can do now */
  ownerAction?: string;
  /** Public-facing description of current period */
  periodLabel?: string;
  raw?: string;
  error?: string;
}

export interface FieldQuery {
  /** e.g. ["status", "period"] */
  fields: string[];
}
