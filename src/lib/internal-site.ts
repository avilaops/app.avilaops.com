/**
 * Endereço público da página interna do cliente.
 *
 * Até 16/09/2026 o host era fixo no código (`cliente.avilaops.com`). Aquele
 * site foi desligado junto com o portal antigo, então não existe mais lugar
 * onde a página responda enquanto ninguém apontar um. O host passa a vir de
 * `INTERNAL_SITE_BASE_URL`; sem a variável, nenhuma URL é inventada e quem
 * chama trata o `null` — dossiê com endereço que devolve erro é pior que
 * dossiê sem endereço.
 */
export function internalSiteBaseUrl(): string | null {
  const configured = process.env.INTERNAL_SITE_BASE_URL?.trim();
  if (!configured) return null;
  return configured.replace(/\/+$/, "");
}

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

/** `null` enquanto `INTERNAL_SITE_BASE_URL` não estiver configurada. */
export function internalSiteUrl(subdomain: string): string | null {
  const base = internalSiteBaseUrl();
  if (!base) return null;
  return `${base}/${subdomain}`;
}

/**
 * Escolhe o primeiro candidato que vira um subdomínio válido — o que o operador
 * digitou, depois o slug do cliente, depois o nome. A página pública só aceita
 * `[a-z0-9-]{2,80}`, então candidato que encolhe para menos de dois caracteres
 * é descartado em vez de virar endereço quebrado.
 */
export function resolveInternalSubdomain(...candidates: (string | null | undefined)[]) {
  for (const candidate of candidates) {
    const subdomain = internalSiteSlug(candidate ?? "");
    if (subdomain.length >= 2) return subdomain;
  }
  return null;
}
