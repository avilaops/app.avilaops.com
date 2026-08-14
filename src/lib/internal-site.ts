const INTERNAL_SITE_BASE_URL = "https://cliente.avilaops.com";

const COMBINING_MARKS = /[̀-ͯ]/g;

export function internalSiteSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function internalSiteUrl(subdomain: string) {
  return `${INTERNAL_SITE_BASE_URL}/${subdomain}`;
}

/**
 * Escolhe o primeiro candidato que vira um subdomínio válido — o que o operador
 * digitou, depois o slug do cliente, depois o nome. A página pública do
 * cliente.avilaops.com só aceita `[a-z0-9-]{2,80}`, então candidato que encolhe
 * para menos de dois caracteres é descartado em vez de virar endereço quebrado.
 */
export function resolveInternalSubdomain(...candidates: (string | null | undefined)[]) {
  for (const candidate of candidates) {
    const subdomain = internalSiteSlug(candidate ?? "");
    if (subdomain.length >= 2) return subdomain;
  }
  return null;
}
