/**
 * O conteúdo de um registro dentro do sistema, igual para qualquer servidor.
 *
 * Cada fornecedor fala uma língua. O servidor autoritativo da casa (PowerDNS)
 * usa a **forma de apresentação** do arquivo de zona (RFC 1035 §5.1): TXT
 * entre aspas, em pedaços, com escapes; host com ponto final. O serviço
 * externo usa **texto puro**: o TXT como string, host sem ponto.
 *
 * Por dentro — tela, validação, versões, comparação — circula a **forma
 * canônica**, e cada adaptador converte na própria fronteira:
 *
 * - host sem ponto final (menos a raiz `.`, que é alvo válido);
 * - TXT como a sequência de bytes do registro, escrita com os escapes da
 *   RFC 1035 e sem aspas: `\\` é a barra, `\DDD` é um byte em decimal. Texto
 *   UTF-8 imprimível fica literal; byte de controle, NUL e byte que não forma
 *   UTF-8 viram `\DDD`.
 *
 * Por que escape e não "o texto como string": TXT carrega octetos
 * quaisquer. Uma string de JavaScript não representa byte solto sem inventar
 * marcador (que colide com texto de verdade), e o JSONB do Postgres recusa
 * U+0000. Com escape, todo byte vira texto seguro, e ida e volta não perde nada.
 */

const TIPOS_COM_HOST_NO_FIM = new Set(["CNAME", "MX", "NS", "SRV"]);

// ── bytes ⇄ forma canônica ────────────────────────────────────────────────

/** Valida uma sequência UTF-8 sem descartar BOM (que é conteúdo, não marcador de fluxo). */
const decodificadorEstrito = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function tamanhoDaSequencia(primeiro: number): number {
  if (primeiro < 0x80) return 1;
  if (primeiro >= 0xc2 && primeiro <= 0xdf) return 2;
  if (primeiro >= 0xe0 && primeiro <= 0xef) return 3;
  if (primeiro >= 0xf0 && primeiro <= 0xf4) return 4;
  return 0;
}

function escapeDecimal(byte: number): string {
  return `\\${String(byte).padStart(3, "0")}`;
}

/** Bytes do registro → forma canônica. */
export function bytesParaCanonico(bytes: Uint8Array | number[]): string {
  const b = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  let saida = "";
  let i = 0;
  while (i < b.length) {
    const byte = b[i];
    if (byte < 0x20 || byte === 0x7f) {
      saida += escapeDecimal(byte);
      i += 1;
      continue;
    }
    if (byte === 0x5c) {
      saida += "\\\\";
      i += 1;
      continue;
    }
    const tamanho = tamanhoDaSequencia(byte);
    if (tamanho > 0 && i + tamanho <= b.length) {
      try {
        saida += decodificadorEstrito.decode(b.subarray(i, i + tamanho));
        i += tamanho;
        continue;
      } catch {
        /* não forma UTF-8: vai como byte */
      }
    }
    saida += escapeDecimal(byte);
    i += 1;
  }
  return saida;
}

/** Forma canônica → bytes do registro. `\DDD` é um byte; `\X` é o caractere X. */
export function canonicoParaBytes(canonico: string): number[] {
  const codificador = new TextEncoder();
  const bytes: number[] = [];
  for (let i = 0; i < canonico.length; i++) {
    const c = canonico[i];
    if (c === "\\" && i + 1 < canonico.length) {
      const decimal = canonico.slice(i + 1, i + 4);
      if (/^\d{3}$/.test(decimal) && Number(decimal) <= 255) {
        bytes.push(Number(decimal));
        i += 3;
        continue;
      }
      const proximo = String.fromCodePoint(canonico.codePointAt(i + 1)!);
      bytes.push(...codificador.encode(proximo));
      i += proximo.length;
      continue;
    }
    const caractere = String.fromCodePoint(canonico.codePointAt(i)!);
    bytes.push(...codificador.encode(caractere));
    i += caractere.length - 1;
  }
  return bytes;
}

// ── fronteira com o serviço externo (texto puro) ───────────────────────────

/** Texto puro do serviço externo → canônica. */
export function txtDeTextoPuro(texto: string): string {
  return bytesParaCanonico(new TextEncoder().encode(texto));
}

/**
 * Canônica → texto puro, para o serviço externo. Byte que não forma UTF-8
 * não tem como ir numa string de API: recusa em vez de trocar o conteúdo.
 */
export function txtParaTextoPuro(canonico: string): string {
  try {
    return decodificadorEstrito.decode(Uint8Array.from(canonicoParaBytes(canonico)));
  } catch {
    throw new Error("Este TXT tem bytes que não são texto UTF-8, e o serviço de DNS deste domínio não os aceita.");
  }
}

// ── fronteira com a forma de apresentação (servidor da casa, BIND) ─────────

/** `"abc" "def"` → bytes, desfazendo os escapes de dentro das aspas. */
function bytesDaApresentacao(conteudo: string): number[] {
  const cru = conteudo.trim();
  const codificador = new TextEncoder();
  const bytes: number[] = [];
  let dentro = false;
  for (let i = 0; i < cru.length; i++) {
    const c = cru[i];
    if (c === '"') {
      dentro = !dentro;
      continue;
    }
    if (!dentro) continue;
    if (c === "\\" && i + 1 < cru.length) {
      const decimal = cru.slice(i + 1, i + 4);
      if (/^\d{3}$/.test(decimal) && Number(decimal) <= 255) {
        bytes.push(Number(decimal));
        i += 3;
        continue;
      }
      const proximo = String.fromCodePoint(cru.codePointAt(i + 1)!);
      bytes.push(...codificador.encode(proximo));
      i += proximo.length;
      continue;
    }
    const caractere = String.fromCodePoint(cru.codePointAt(i)!);
    bytes.push(...codificador.encode(caractere));
    i += caractere.length - 1;
  }
  return bytes;
}

/** É TXT em forma de apresentação: só pedaços entre aspas separados por espaço. */
export function ehTxtDeApresentacao(conteudo: string): boolean {
  return /^\s*("(?:[^"\\]|\\[\s\S])*"\s*)+$/.test(conteudo);
}

/**
 * Bytes em pedaços de até 255 (RFC 1035 §3.3: cada string de caractere tem um
 * byte de tamanho), sem partir uma sequência UTF-8 no meio.
 */
export function pedacosDe255Bytes(bytes: number[]): number[][] {
  const pedacos: number[][] = [[]];
  let i = 0;
  while (i < bytes.length) {
    const tamanho = tamanhoDaSequencia(bytes[i]) || 1;
    const sequencia = bytes.slice(i, i + tamanho);
    if (pedacos[pedacos.length - 1].length + sequencia.length > 255) pedacos.push([]);
    pedacos[pedacos.length - 1].push(...sequencia);
    i += sequencia.length;
  }
  return pedacos;
}

/** Bytes → forma de apresentação: cada pedaço entre aspas, com aspas internas escapadas. */
function bytesParaApresentacao(bytes: number[]): string {
  return pedacosDe255Bytes(bytes)
    .map((pedaco) => `"${bytesParaCanonico(pedaco).replace(/"/g, '\\"')}"`)
    .join(" ");
}

function semPontoNoAlvo(conteudo: string): string {
  const partes = conteudo.trim().split(/\s+/);
  const ultimo = partes[partes.length - 1];
  if (ultimo !== "." && ultimo.endsWith(".")) partes[partes.length - 1] = ultimo.slice(0, -1);
  return partes.join(" ");
}

/** Forma de apresentação → canônica. Para o que veio do servidor da casa. */
export function daApresentacao(tipo: string, conteudo: string): string {
  const t = tipo.toUpperCase();
  if (t === "TXT") return bytesParaCanonico(bytesDaApresentacao(conteudo));
  if (TIPOS_COM_HOST_NO_FIM.has(t)) return semPontoNoAlvo(conteudo);
  return conteudo.trim();
}

/** Canônica → forma de apresentação, para o servidor da casa e o arquivo de zona. */
export function paraApresentacao(tipo: string, conteudo: string): string {
  const t = tipo.toUpperCase();
  if (t === "TXT") return bytesParaApresentacao(canonicoParaBytes(conteudo));
  if (TIPOS_COM_HOST_NO_FIM.has(t)) {
    const partes = conteudo.trim().split(/\s+/);
    const ultimo = partes[partes.length - 1];
    partes[partes.length - 1] = ultimo.endsWith(".") ? ultimo : `${ultimo}.`;
    return partes.join(" ");
  }
  return conteudo.trim();
}

/** Texto puro do serviço externo → canônica. */
export function deTextoPuro(tipo: string, conteudo: string): string {
  const t = tipo.toUpperCase();
  if (t === "TXT") return txtDeTextoPuro(conteudo);
  if (TIPOS_COM_HOST_NO_FIM.has(t)) return semPontoNoAlvo(conteudo);
  return conteudo.trim();
}

/** Canônica → texto puro, para o serviço externo. */
export function paraTextoPuro(tipo: string, conteudo: string): string {
  if (tipo.toUpperCase() === "TXT") return txtParaTextoPuro(conteudo);
  return conteudo.trim();
}

/** Normalização que não depende de origem: host sem ponto final. TXT já é canônico. */
export function normalizarCanonico(tipo: string, conteudo: string): string {
  const t = tipo.toUpperCase();
  if (t === "TXT") return conteudo;
  if (TIPOS_COM_HOST_NO_FIM.has(t)) return semPontoNoAlvo(conteudo);
  return conteudo.trim();
}

/**
 * Registro que é do servidor, não do titular: SOA e os NS do próprio domínio.
 * Não entram em versão, restauração nem exportação — o SOA muda de serial a
 * cada alteração, e voltar a um SOA antigo quebraria a zona.
 */
export function ehDoServidor(registro: { tipo: string; nome: string }, zona: string): boolean {
  const tipo = registro.tipo.toUpperCase();
  if (tipo === "SOA") return true;
  const nome = registro.nome.trim().toLowerCase().replace(/\.$/, "");
  const raiz = zona.trim().toLowerCase().replace(/\.$/, "");
  return tipo === "NS" && (nome === raiz || nome === "@" || nome === "");
}
