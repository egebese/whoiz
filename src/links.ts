export function spaceshipSearchUrl(domain: string): string {
  const params = new URLSearchParams({ query: domain });
  return `https://www.spaceship.com/domain-search/?${params.toString()}`;
}

export function spaceshipHomeUrl(): string {
  return "https://www.spaceship.com/";
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
