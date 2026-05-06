const SPACESHIP_GENERAL = "https://spaceship.sjv.io/c/7246603/1859616/21274";
const SPACESHIP_TRANSFER = "https://spaceship.sjv.io/c/7246603/2873270/21274";

// Impact.com (sjv.io) supports a `u=<encoded-url>` deep-link param so users
// land on the right page on Spaceship after attribution. If a deep link ever
// stops resolving, the user still ends up on the correct general / transfer
// landing page rather than a dead URL.
function deepLink(base: string, target: string): string {
  return `${base}?u=${encodeURIComponent(target)}`;
}

export function spaceshipSearchUrl(domain: string): string {
  const target = `https://www.spaceship.com/domain-search/?${new URLSearchParams({ query: domain }).toString()}`;
  return deepLink(SPACESHIP_GENERAL, target);
}

export function spaceshipTransferUrl(domain: string): string {
  const target = `https://www.spaceship.com/domains/transfer/?${new URLSearchParams({ query: domain }).toString()}`;
  return deepLink(SPACESHIP_TRANSFER, target);
}

export function spaceshipHomeUrl(): string {
  return SPACESHIP_GENERAL;
}

/** Quick-jump links for an available domain across a few popular registrars. */
export function alternativeRegisterLinks(domain: string): { name: string; url: string }[] {
  const q = encodeURIComponent(domain);
  return [
    { name: "Spaceship", url: spaceshipSearchUrl(domain) },
    { name: "Porkbun", url: `https://porkbun.com/checkout/search?q=${q}` },
    { name: "Namecheap", url: `https://www.namecheap.com/domains/registration/results/?domain=${q}` },
    { name: "Cloudflare", url: `https://dash.cloudflare.com/?to=/:account/domains/register/${q}` },
  ];
}
