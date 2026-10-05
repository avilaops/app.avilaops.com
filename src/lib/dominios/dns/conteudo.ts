/**
 * O conteúdo de um registro: forma lógica e forma de apresentação.
 *
 * Dentro do sistema todo conteúdo circula em **forma lógica**: o texto do TXT
 * como ele é, o nome de host sem ponto final. É o que o serviço externo usa
 * na API dele.
 *
 * A **forma de apresentação** é a do arquivo de zona (RFC 1035 §5.1): TXT
 * entre aspas, em pedaços, com escapes; host com ponto final. É o que o
 * servidor autoritativo da casa (PowerDNS) fala, e o que sai no BIND.
 *
 * A conversão mora na fronteira com quem fala apresentação — o adaptador da
 * casa e a exportação — e só lá. Converter no meio do caminho, sem saber de
 * onde o dado veio, tomaria por aspas de apresentação um TXT do serviço
 * externo que começa com aspas de verdade, e as apagaria.
 */

const TIPOS_COM_HOST_NO_FIM = new Set(["CNAME", "MX", "NS", "SRV"]);

/**
 * Byte que não forma UTF-8 válido (TXT carrega octetos quaisquer). Vira um
 * caractere da área de uso privado, U+F700 + byte, que atravessa JSON e o
 * banco sem perda, e volta a ser o byte na forma de apresentação. Texto real
 * nessa faixa não aparece em registro de DNS.
 */
const BASE_BYTE_SOLTO = 0xf700;

function ehByteSolto(codigo: number): boolean {
  return codigo >= BASE_BYTE_SOLTO && codigo <= BASE_BYTE_SOLTO + 0xff;
}

/** Bytes em texto: UTF-8 válido vira o caractere; o que não for vira byte solto. */
function bytesParaTexto(bytes: number[]): string {
  const decodificador = new TextDecoder("utf-8", { fatal: true });
  let saida = "";
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    const tamanho = b < 0x80 ? 1 : b >= 0xc2 && b <= 0xdf ? 2 : b >= 0xe0 && b <= 0xef ? 3 : b >= 0xf0 && b <= 0xf4 ? 4 : 0;
    if (tamanho > 0 && i + tamanho <= bytes.length) {
      try {
        saida += decodificador.decode(new Uint8Array(bytes.slice(i, i + tamanho)));
        i += tamanho;
        continue;
      } catch {
        /* sequência inválida: cai para byte solto */
      }
    }
    saida += String.fromCodePoint(BASE_BYTE_SOLTO + b);
    i += 1;
  }
  return saida;
}

/** Bytes de um caractere lógico: byte solto é um byte só. */
function bytesDe(caractere: string): number[] {
  const codigo = caractere.codePointAt(0)!;
  if (ehByteSolto(codigo)) return [codigo - BASE_BYTE_SOLTO];
  return [...new TextEncoder().encode(caractere)];
}

/**
 * `"abc" "def"` → `abcdef`, desfazendo os escapes: `\X` é o caractere X e
 * `\DDD` é um byte em decimal. Os bytes são remontados em UTF-8 no fim, para
 * `\195\169` voltar a ser "é".
 */
function txtDaApresentacao(conteudo: string): string {
  const cru = conteudo.trim();
  if (!cru.startsWith('"')) return conteudo;

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
    if (c === "\\") {
      const decimal = cru.slice(i + 1, i + 4);
      if (/^\d{3}$/.test(decimal) && Number(decimal) <= 255) {
        bytes.push(Number(decimal));
        i += 3;
      } else if (i + 1 < cru.length) {
        bytes.push(...codificador.encode(cru[i + 1]));
        i += 1;
      }
      continue;
    }
    bytes.push(...codificador.encode(c));
  }
  return bytesParaTexto(bytes);
}

/**
 * Tira o ponto final do último nome do conteúdo, menos quando ele é a raiz
 * sozinha: `.` é alvo válido (MX nulo da RFC 7505, SRV "serviço indisponível")
 * e sem o ponto viraria texto vazio.
 */
function semPontoNoAlvo(conteudo: string): string {
  const partes = conteudo.trim().split(/\s+/);
  const ultimo = partes[partes.length - 1];
  if (ultimo !== "." && ultimo.endsWith(".")) partes[partes.length - 1] = ultimo.slice(0, -1);
  return partes.join(" ");
}

/**
 * Normalização que vale para conteúdo de qualquer origem: só o ponto final de
 * host, que é ambíguo nos dois lados. TXT passa intacto — aspas num TXT
 * lógico são conteúdo.
 */
export function normalizarLogico(tipo: string, conteudo: string): string {
  const t = tipo.toUpperCase();
  if (t === "TXT") return conteudo;
  if (TIPOS_COM_HOST_NO_FIM.has(t)) return semPontoNoAlvo(conteudo);
  return conteudo.trim();
}

/** Forma de apresentação → lógica. Só para o que veio de quem fala apresentação. */
export function daApresentacao(tipo: string, conteudo: string): string {
  if (tipo.toUpperCase() === "TXT") return txtDaApresentacao(conteudo);
  return normalizarLogico(tipo, conteudo);
}

/**
 * Divide em pedaços de até 255 **bytes** (RFC 1035 §3.3: cada string de
 * caractere tem um byte de tamanho), sem cortar um caractere de vários bytes
 * no meio. Contar caracteres deixaria "é" × 200 num pedaço de 400 bytes.
 */
export function pedacosDe255Bytes(texto: string): string[] {
  const pedacos: string[] = [];
  let atual = "";
  let bytes = 0;
  for (const caractere of texto) {
    const tamanho = bytesDe(caractere).length;
    if (bytes + tamanho > 255) {
      pedacos.push(atual);
      atual = "";
      bytes = 0;
    }
    atual += caractere;
    bytes += tamanho;
  }
  pedacos.push(atual);
  return pedacos;
}

/**
 * Um pedaço de TXT em forma de apresentação. Aspas e barra levam escape; byte
 * de controle (quebra de linha, tab, DEL) e byte solto viram `\DDD`, senão o
 * registro sai com uma quebra de linha no meio ou com bytes trocados.
 */
function escaparPedaco(pedaco: string): string {
  let saida = "";
  for (const caractere of pedaco) {
    const codigo = caractere.codePointAt(0)!;
    if (caractere === "\\" || caractere === '"') saida += `\\${caractere}`;
    else if (codigo < 0x20 || codigo === 0x7f) saida += `\\${String(codigo).padStart(3, "0")}`;
    else if (ehByteSolto(codigo)) saida += `\\${String(codigo - BASE_BYTE_SOLTO).padStart(3, "0")}`;
    else saida += caractere;
  }
  return saida;
}

/** TXT lógico em forma de apresentação: entre aspas, em pedaços de 255 bytes. */
export function txtEmAspas(logico: string): string {
  return pedacosDe255Bytes(logico)
    .map((p) => `"${escaparPedaco(p)}"`)
    .join(" ");
}

/** Forma lógica → apresentação, para o servidor autoritativo e o arquivo de zona. */
export function paraApresentacao(tipo: string, conteudo: string): string {
  const t = tipo.toUpperCase();
  if (t === "TXT") return txtEmAspas(conteudo);
  if (TIPOS_COM_HOST_NO_FIM.has(t)) {
    const partes = conteudo.trim().split(/\s+/);
    const ultimo = partes[partes.length - 1];
    partes[partes.length - 1] = ultimo.endsWith(".") ? ultimo : `${ultimo}.`;
    return partes.join(" ");
  }
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
