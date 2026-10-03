/**
 * Normalização e validação de nome de domínio, compartilhada por quem consulta
 * disponibilidade (`domain-availability`) e por quem fala com o Registro.br
 * (`registro-br`). Mora aqui para os dois não se importarem em círculo.
 */

import { toASCII } from "tr46";

const DOMINIO_RE = /^(?!-)(?:[a-z0-9-]{1,63}\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/**
 * Aceita o que a pessoa cola de verdade (`https://www.empresa.com.br:8443/contato?x=1`)
 * e devolve só o host em minúsculas.
 */
export function normalizeDomainInput(value: string): string {
  const trimmed = value.trim().toLowerCase();
  // Porta sai junto com caminho e query: "empresa.com.br:8443" virava
  // "empresa.com.br8443" quando o ":" era removido como caractere inválido.
  const withoutProtocol = trimmed
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .split("?")[0]
    .split("#")[0]
    .split(":")[0];
  const host = withoutProtocol.replace(/^www\./, "").replace(/\.$/, "");
  if (!host) return "";
  // Acento não é lixo: "café.com.br" é outro domínio que "caf.com.br". O
  // UTS #46 converte para Punycode ("xn--caf-dma.com.br"), que é como o DNS e
  // o Registro.br o conhecem. O que ele recusa volta como veio, para a
  // validação reprovar — apagar caractere trocava o cliente de domínio.
  return (paraAscii(host) ?? host).slice(0, 253);
}

export function ehDominioValido(fqdn: string): boolean {
  return DOMINIO_RE.test(fqdn) && !fqdn.includes("..") && paraAscii(fqdn) === fqdn;
}

/**
 * UTS #46 pelo `tr46`, a mesma implementação que o WHATWG URL usa, fixada no
 * package.json. Não dá para delegar ao `new URL()`: o Node 22 de produção e o
 * Node 24 do CI discordam sobre rótulos como "empresa.xn--a" e "xn--gfc.com",
 * e uma regra própria por categoria Unicode deixava passar o que o IDNA veta
 * (marca combinante no início, junções, bidi). Rótulo `xn--` é decodificado e
 * validado por inteiro; o que não sobrevive volta null.
 */
function paraAscii(dominio: string): string | null {
  return toASCII(dominio, {
    checkBidi: true,
    checkJoiners: true,
    // Como no WHATWG URL: "ab--c.com.br" é ASCII legítimo e continua aceito.
    checkHyphens: false,
    useSTD3ASCIIRules: true,
    verifyDNSLength: true,
  });
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
