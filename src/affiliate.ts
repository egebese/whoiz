// Spaceship affiliate links.
// Replace SPACESHIP_AFFILIATE_ID with your affiliate code, or set the
// WHOIZ_SPACESHIP_AFFILIATE env var at runtime to override.

export const SPACESHIP_AFFILIATE_ID =
  process.env.WHOIZ_SPACESHIP_AFFILIATE ?? "REPLACE_ME";

const REF = `?ref=${encodeURIComponent(SPACESHIP_AFFILIATE_ID)}`;

/**
 * Spaceship pre-fills the search box if the domain is passed as `?domain=`,
 * which is what we want when a TLD is available — the affiliate cookie is
 * also set on the way through.
 */
export function spaceshipSearchUrl(domain: string): string {
  const base = "https://www.spaceship.com/domain-search/";
  const params = new URLSearchParams({
    query: domain,
    ref: SPACESHIP_AFFILIATE_ID,
  });
  return `${base}?${params.toString()}`;
}

export function spaceshipHomeUrl(): string {
  return `https://www.spaceship.com/${REF}`;
}

/** Generic registrar links a user might want to compare against. */
export function alternativeRegisterLinks(domain: string): { name: string; url: string }[] {
  const q = encodeURIComponent(domain);
  return [
    { name: "Spaceship", url: spaceshipSearchUrl(domain) },
    { name: "Porkbun", url: `https://porkbun.com/checkout/search?q=${q}` },
    { name: "Namecheap", url: `https://www.namecheap.com/domains/registration/results/?domain=${q}` },
    { name: "Cloudflare", url: `https://dash.cloudflare.com/?to=/:account/domains/register/${q}` },
  ];
}
