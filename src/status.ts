// EPP (Extensible Provisioning Protocol) status codes
// Reference: https://www.icann.org/resources/pages/epp-status-codes-2014-06-16-en

export interface StatusMeta {
  code: string;
  label: string;
  /** Plain-language explanation */
  description: string;
  /** "good" = healthy, "warn" = attention, "bad" = problem, "info" */
  severity: "good" | "warn" | "bad" | "info";
}

const TABLE: Record<string, StatusMeta> = {
  ok: {
    code: "ok",
    label: "Active",
    description: "Standard active status — no pending operations or restrictions.",
    severity: "good",
  },
  inactive: {
    code: "inactive",
    label: "Inactive",
    description: "Domain has no nameservers — will not resolve in DNS.",
    severity: "warn",
  },

  // Client-set (registrar) locks — owner-protective
  clientTransferProhibited: {
    code: "clientTransferProhibited",
    label: "Transfer Lock",
    description: "Registrar will reject transfer requests. Standard protection — turn off when transferring.",
    severity: "good",
  },
  clientUpdateProhibited: {
    code: "clientUpdateProhibited",
    label: "Update Lock",
    description: "Registrar will reject update requests (nameserver/contact changes).",
    severity: "good",
  },
  clientDeleteProhibited: {
    code: "clientDeleteProhibited",
    label: "Delete Lock",
    description: "Registrar will reject delete requests.",
    severity: "good",
  },
  clientRenewProhibited: {
    code: "clientRenewProhibited",
    label: "Renew Lock",
    description: "Renewal requests are blocked. Rare — usually means the domain is being released.",
    severity: "warn",
  },
  clientHold: {
    code: "clientHold",
    label: "DNS Suspended (registrar)",
    description: "Registrar pulled DNS — domain will not resolve. Often payment / abuse / dispute related.",
    severity: "bad",
  },

  // Server-set (registry) locks — registry-side
  serverTransferProhibited: {
    code: "serverTransferProhibited",
    label: "Registry Transfer Lock",
    description: "Registry blocks transfers. Common in first 60 days after registration/transfer.",
    severity: "info",
  },
  serverUpdateProhibited: {
    code: "serverUpdateProhibited",
    label: "Registry Update Lock",
    description: "Registry blocks updates. Often legal/dispute hold.",
    severity: "warn",
  },
  serverDeleteProhibited: {
    code: "serverDeleteProhibited",
    label: "Registry Delete Lock",
    description: "Registry blocks deletion.",
    severity: "info",
  },
  serverRenewProhibited: {
    code: "serverRenewProhibited",
    label: "Registry Renew Lock",
    description: "Registry blocks renewal — domain will expire as scheduled.",
    severity: "warn",
  },
  serverHold: {
    code: "serverHold",
    label: "DNS Suspended (registry)",
    description: "Registry pulled DNS. Usually legal hold or court order.",
    severity: "bad",
  },

  // Pending / lifecycle
  pendingCreate: {
    code: "pendingCreate",
    label: "Pending Create",
    description: "Registration request is being processed.",
    severity: "info",
  },
  pendingUpdate: {
    code: "pendingUpdate",
    label: "Pending Update",
    description: "An update request is being processed.",
    severity: "info",
  },
  pendingTransfer: {
    code: "pendingTransfer",
    label: "Pending Transfer",
    description: "Transfer to another registrar is in progress (usually 5 days).",
    severity: "info",
  },
  pendingRenew: {
    code: "pendingRenew",
    label: "Pending Renew",
    description: "Renewal in progress.",
    severity: "info",
  },
  pendingDelete: {
    code: "pendingDelete",
    label: "Pending Delete",
    description: "Domain is being released. ~5 days until it drops and becomes available to the public.",
    severity: "warn",
  },
  pendingRestore: {
    code: "pendingRestore",
    label: "Pending Restore",
    description: "Owner has filed restore from redemption — registry is verifying.",
    severity: "info",
  },

  // Grace periods (RGP)
  addPeriod: {
    code: "addPeriod",
    label: "Add Grace (5d)",
    description: "Within ~5 days of registration. Registrar may delete for full refund.",
    severity: "info",
  },
  autoRenewPeriod: {
    code: "autoRenewPeriod",
    label: "Auto-Renew Grace (~45d)",
    description: "Within ~45 days of auto-renewal. Registrar may still credit a deletion.",
    severity: "info",
  },
  renewPeriod: {
    code: "renewPeriod",
    label: "Renew Grace (~5d)",
    description: "Within ~5 days of an explicit renewal.",
    severity: "info",
  },
  transferPeriod: {
    code: "transferPeriod",
    label: "Transfer Grace (~5d)",
    description: "Within ~5 days of a successful transfer.",
    severity: "info",
  },
  redemptionPeriod: {
    code: "redemptionPeriod",
    label: "Redemption (~30d)",
    description: "Domain expired and is in redemption. Original owner can restore for a hefty fee (~$80–$150) for ~30 days. Not registerable by others yet.",
    severity: "warn",
  },

  // ccTLD-specific (DENIC, TRABIS, AFNIC, etc.) — not EPP but commonly seen
  connect: {
    code: "connect",
    label: "Connected (.de)",
    description: "DENIC: domain is registered and resolvable.",
    severity: "good",
  },
  free: {
    code: "free",
    label: "Free (.de)",
    description: "DENIC: domain is not registered and is registerable.",
    severity: "info",
  },
  failed: {
    code: "failed",
    label: "Failed (.de)",
    description: "DENIC: registration could not complete (technical error).",
    severity: "bad",
  },
  invalid: {
    code: "invalid",
    label: "Invalid (.de)",
    description: "DENIC: domain name is not valid under .de policy.",
    severity: "bad",
  },
  ACTIVE: {
    code: "ACTIVE",
    label: "Active",
    description: "ccTLD registry: domain is registered and active.",
    severity: "good",
  },
  RESERVED: {
    code: "RESERVED",
    label: "Reserved",
    description: "Registry-reserved name (e.g. .tr blocks generic terms).",
    severity: "warn",
  },
  RESTRICTED: {
    code: "RESTRICTED",
    label: "Restricted",
    description: "Registration requires extra eligibility (e.g. local presence).",
    severity: "warn",
  },
  BLOCKED: {
    code: "BLOCKED",
    label: "Blocked",
    description: "Registry has blocked this name (legal/dispute).",
    severity: "bad",
  },
  FROZEN: {
    code: "FROZEN",
    label: "Frozen (AFNIC)",
    description: "AFNIC (.fr): domain is frozen by registry — usually pending owner action.",
    severity: "warn",
  },
  "in quarantine": {
    code: "in quarantine",
    label: "Quarantine (.nl)",
    description: "SIDN (.nl): domain expired and is in 40-day quarantine before being released.",
    severity: "warn",
  },
  REGISTERED: {
    code: "REGISTERED",
    label: "Registered",
    description: "Registry confirms an active registration.",
    severity: "good",
  },
  DELEGATED: {
    code: "DELEGATED",
    label: "Delegated",
    description: "Nameservers are configured at the registry — DNS will work.",
    severity: "good",
  },
  VERIFIED: {
    code: "VERIFIED",
    label: "Verified",
    description: "Registrant identity has been verified by the registrar.",
    severity: "good",
  },
};

const LOWER_INDEX: Record<string, StatusMeta> = Object.fromEntries(
  Object.entries(TABLE).map(([k, v]) => [k.toLowerCase(), v]),
);

export function getStatusMeta(rawCode: string): StatusMeta {
  // strip URL part: "clientTransferProhibited https://icann.org/epp#..."
  // also strip parenthesized URLs: "clientTransferProhibited (https://...)"
  const codeRaw = rawCode.split(/[\s(]/)[0]?.trim() ?? rawCode;
  const found = TABLE[codeRaw] ?? LOWER_INDEX[codeRaw.toLowerCase()];
  if (found) return found;
  return {
    code: codeRaw,
    label: codeRaw,
    description: "Status code not recognized in the standard EPP set.",
    severity: "info",
  };
}

export function statusList(): StatusMeta[] {
  return Object.values(TABLE);
}
