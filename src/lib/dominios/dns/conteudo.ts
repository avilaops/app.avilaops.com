/**
 * O conteúdo de um registro dentro do sistema, igual para qualquer servidor.
 *
 * Cada fornecedor fala uma língua. O servidor autoritativo da casa (PowerDNS)
 * usa a forma de apresentação do arquivo de zona (RFC 1035 §5.1); o serviço
 * externo usa texto puro. Por dentro — tela, validação, versões, comparação —
 * circula a **forma canônica**, e cada adaptador converte na própria fronteira:
 *
 * - host sem ponto final (menos a raiz `.`, que é alvo válido);
 * - TXT na forma de apresentação **normalizada**: cada string de caractere
 *   entre aspas, separadas por um espaço, com um só jeito de escrever cada
 *   byte — UTF-8 imprimível literal, `\"` e `\\` para aspas e barra, `\DDD`
 *   para controle, NUL e byte que não forma UTF-8.
 *
 * Apresentação, e não texto solto, porque um TXT é uma lista de strings de
 * caractere: `"foo" "bar"` e `"foobar"` são registros diferentes, e espaço na
 * ponta ou TXT vazio (`""`) precisam sobreviver a uma edição de TTL.
 * Normalizada, porque a mesma sequência de bytes pode ser escrita de vários
 * jeitos (`v` e `\118`), e a comparação e a validação de SPF precisam ver uma
 * forma só. Todo byte vira texto seguro para o JSONB, que recusa U+0000.
 */

const TIPOS_COM_HOST_NO_FIM = new Set(["CNAME", "MX", "NS", "SRV"]);

// ── bytes de uma string de caractere ⇄ texto escapado ──────────────────────

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

/** Bytes de uma string de caractere → texto com escapes (sem as aspas em volta). */
export function escaparBytes(bytes: Uint8Array | number[]): string {
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

// ── strings de caractere ⇄ forma canônica ────────────────────────────────

/** `"abc" "def"` → as strings de caractere, cada uma em bytes. */
function segmentosDaApresentacao(conteudo: string): number[][] {
  const cru = conteudo.trim();
  const codificador = new TextEncoder();
  const segmentos: number[][] = [];
  let atual: number[] | null = null;
  for (let i = 0; i < cru.length; i++) {
    const c = cru[i];
    if (c === '"') {
      if (atual) {
        segmentos.push(atual);
        atual = null;
      } else {
        atual = [];
      }
      continue;
    }
    if (!atual) continue;
    if (c === "\\" && i + 1 < cru.length) {
      const decimal = cru.slice(i + 1, i + 4);
      if (/^\d{3}$/.test(decimal) && Number(decimal) <= 255) {
        atual.push(Number(decimal));
        i += 3;
        continue;
      }
      const proximo = String.fromCodePoint(cru.codePointAt(i + 1)!);
      atual.push(...codificador.encode(proximo));
      i += proximo.length;
      continue;
    }
    const caractere = String.fromCodePoint(cru.codePointAt(i)!);
    atual.push(...codificador.encode(caractere));
    i += caractere.length - 1;
  }
  return segmentos;
}

/** É TXT em forma de apresentação: só strings entre aspas separadas por espaço. */
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

/** Strings de caractere → forma canônica. String com mais de 255 bytes é dividida. */
function txtCanonico(segmentos: number[][]): string {
  const todos = (segmentos.length ? segmentos : [[]]).flatMap((s) => (s.length > 255 ? pedacosDe255Bytes(s) : [s]));
  return todos.map((s) => `"${escaparBytes(s).replace(/"/g, '\\"')}"`).join(" ");
}

/** As strings de caractere de um TXT canônico. */
export function segmentosDoTxt(canonico: string): number[][] {
  return segmentosDaApresentacao(canonico);
}

/** Apresentação (de qualquer jeito escrita) → canônica. */
function txtDaApresentacao(conteudo: string): string {
  return txtCanonico(segmentosDaApresentacao(conteudo));
}

/** Texto solto → canônica: uma string, dividida em pedaços de 255 bytes. */
export function txtDeTextoPuro(texto: string): string {
  return txtCanonico(pedacosDe255Bytes([...new TextEncoder().encode(texto)]));
}

/**
 * O que a pessoa digitou na tela. Entre aspas é forma de apresentação (como
 * em todo painel de DNS); sem aspas, é o texto. Normaliza antes de validar:
 * `\118=spf1` e `v=spf1` são o mesmo SPF para a regra de SPF duplicado.
 */
export function txtDeEntrada(digitado: string): string {
  return ehTxtDeApresentacao(digitado) ? txtDaApresentacao(digitado) : txtDeTextoPuro(digitado.trim());
}

// ── fronteira com o serviço externo (texto puro) ───────────────────────────

/**
 * Canônica → texto puro, para a API do serviço externo, que trata o TXT como
 * um texto só e o divide sozinho a cada 255 bytes. Recusa, em vez de trocar o
 * conteúdo, o que ela não consegue guardar: byte que não forma UTF-8, e TXT
 * dividido em strings de outro jeito (`"foo" "bar"`), cuja divisão se perderia.
 */
export function txtParaTextoPuro(canonico: string): string {
  const segmentos = segmentosDaApresentacao(canonico);
  const bytes = segmentos.flat();
  let texto: string;
  try {
    texto = decodificadorEstrito.decode(Uint8Array.from(bytes));
  } catch {
    throw new Error("Este TXT tem bytes que não são texto UTF-8, e o serviço de DNS deste domínio não os aceita.");
  }
  if (txtDeTextoPuro(texto) !== txtCanonico(segmentos)) {
    throw new Error("Este TXT é dividido em strings separadas, e o serviço de DNS deste domínio não guarda essa divisão.");
  }
  return texto;
}

function semPontoNoAlvo(conteudo: string): string {
  const partes = conteudo.trim().split(/\s+/);
  // Nome de host não diferencia maiúscula (RFC 4343): `MX.Example.COM` e
  // `mx.example.com` são o mesmo alvo, e não podem virar apagar e recriar.
  const ultimo = partes[partes.length - 1].toLowerCase();
  partes[partes.length - 1] = ultimo !== "." && ultimo.endsWith(".") ? ultimo.slice(0, -1) : ultimo;
  return partes.join(" ");
}

/** Forma de apresentação → canônica. Para o que veio do servidor da casa. */
export function daApresentacao(tipo: string, conteudo: string): string {
  const t = tipo.toUpperCase();
  if (t === "TXT") return txtDaApresentacao(conteudo);
  if (TIPOS_COM_HOST_NO_FIM.has(t)) return semPontoNoAlvo(conteudo);
  return conteudo.trim();
}

/** Canônica → forma de apresentação, para o servidor da casa e o arquivo de zona. */
export function paraApresentacao(tipo: string, conteudo: string): string {
  const t = tipo.toUpperCase();
  if (t === "TXT") return txtDaApresentacao(conteudo);
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
  // O que a API devolve é o texto do registro, inclusive aspas que façam parte
  // dele: nunca é lido como forma de apresentação.
  if (t === "TXT") return txtDeTextoPuro(conteudo);
  if (TIPOS_COM_HOST_NO_FIM.has(t)) return semPontoNoAlvo(conteudo);
  return conteudo.trim();
}

/** Canônica → texto puro, para o serviço externo. */
export function paraTextoPuro(tipo: string, conteudo: string): string {
  if (tipo.toUpperCase() === "TXT") return txtParaTextoPuro(conteudo);
  return conteudo.trim();
}

/** Normalização que não depende de origem: host sem ponto final; TXT reescrito na forma canônica. */
export function normalizarCanonico(tipo: string, conteudo: string): string {
  const t = tipo.toUpperCase();
  if (t === "TXT") return txtDeEntrada(conteudo);
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
