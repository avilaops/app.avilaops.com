/**
 * Normalização e validação de nome de domínio, compartilhada por quem consulta
 * disponibilidade (`domain-availability`) e por quem fala com o Registro.br
 * (`registro-br`). Mora aqui para os dois não se importarem em círculo.
 */

const DOMINIO_RE = /^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/;

/**
 * Aceita o que a pessoa cola de verdade (`https://www.empresa.com.br/contato?x=1`)
 * e devolve só o host em minúsculas.
 */
export function normalizeDomainInput(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const withoutProtocol = trimmed.replace(/^https?:\/\//, "").split("/")[0].split("?")[0];
  const withoutWww = withoutProtocol.replace(/^www\./, "");
  return withoutWww.replace(/[^a-z0-9.-]/g, "").slice(0, 253);
}

export function ehDominioValido(fqdn: string): boolean {
  return DOMINIO_RE.test(fqdn) && !fqdn.includes("..");
}

/** Normaliza e recusa o que não é um nome de domínio. */
export function exigirDominio(value: string): string {
  const fqdn = normalizeDomainInput(value);
  if (!ehDominioValido(fqdn)) {
    throw new Error("Informe um domínio válido, como empresa.com.br.");
  }
  return fqdn;
}

export function ehDominioBr(fqdn: string): boolean {
  return /\.br$/i.test(fqdn.trim());
}
