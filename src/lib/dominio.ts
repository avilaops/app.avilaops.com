/**
 * Normalização e validação de nome de domínio, compartilhada por quem consulta
 * disponibilidade (`domain-availability`) e por quem fala com o Registro.br
 * (`registro-br`). Mora aqui para os dois não se importarem em círculo.
 */

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
  // parser de URL converte para Punycode ("xn--caf-dma.com.br"), que é como o
  // DNS e o Registro.br o conhecem. O que ele recusa volta como veio, para a
  // validação reprovar — apagar caractere trocava o cliente de domínio.
  try {
    return new URL(`http://${host}`).hostname.slice(0, 253);
  } catch {
    return host.slice(0, 253);
  }
}

export function ehDominioValido(fqdn: string): boolean {
  return (
    DOMINIO_RE.test(fqdn) &&
    !fqdn.includes("..") &&
    fqdn.split(".").every((rotulo) => !rotulo.startsWith("xn--") || punycodeLegivel(rotulo.slice(4)))
  );
}

/**
 * A regex vê só o formato: "empresa.xn--a" e "xn--a.com.br" passam nela, mas
 * não são nome nenhum ("a" decodifica para U+0080, um caractere de controle).
 * Não dá para delegar ao parser de URL: o Node 22 de produção recusa esses
 * rótulos e o Node 24 do CI aceita. Decodifica aqui e exige o que um rótulo
 * internacionalizado de verdade tem: ao menos um caractere fora do ASCII, e
 * só letras, marcas, dígitos e hífen.
 */
function punycodeLegivel(codificado: string): boolean {
  const texto = decodificarPunycode(codificado);
  return (
    texto !== null &&
    /[^\x00-\x7f]/.test(texto) &&
    /^[\p{L}\p{M}\p{N}-]+$/u.test(texto)
  );
}

/** Decodificador Bootstring da RFC 3492, seção 6.2. Null se a entrada for inválida. */
function decodificarPunycode(entrada: string): string | null {
  const BASE = 36, TMIN = 1, TMAX = 26, SKEW = 38, DAMP = 700;
  const adaptar = (delta: number, pontos: number, primeiro: boolean) => {
    delta = primeiro ? Math.floor(delta / DAMP) : delta >> 1;
    delta += Math.floor(delta / pontos);
    let k = 0;
    while (delta > ((BASE - TMIN) * TMAX) >> 1) {
      delta = Math.floor(delta / (BASE - TMIN));
      k += BASE;
    }
    return k + Math.floor(((BASE - TMIN + 1) * delta) / (delta + SKEW));
  };
  const digito = (c: number) =>
    c >= 0x30 && c <= 0x39 ? c - 22 : c >= 0x61 && c <= 0x7a ? c - 0x61 : BASE;

  const delimitador = entrada.lastIndexOf("-");
  const saida = delimitador > 0 ? [...entrada.slice(0, delimitador)].map((c) => c.codePointAt(0)!) : [];
  let n = 128, i = 0, bias = 72;
  for (let pos = delimitador > 0 ? delimitador + 1 : 0; pos < entrada.length; ) {
    const anterior = i;
    for (let w = 1, k = BASE; ; k += BASE) {
      if (pos >= entrada.length) return null;
      const d = digito(entrada.charCodeAt(pos++));
      if (d >= BASE) return null;
      i += d * w;
      const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
      if (d < t) break;
      w *= BASE - t;
      if (i > 0x10ffff * 8) return null;
    }
    bias = adaptar(i - anterior, saida.length + 1, anterior === 0);
    n += Math.floor(i / (saida.length + 1));
    i %= saida.length + 1;
    if (n > 0x10ffff) return null;
    saida.splice(i++, 0, n);
  }
  return String.fromCodePoint(...saida);
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
