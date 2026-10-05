/**
 * O conteúdo de um registro em forma lógica, igual para qualquer servidor.
 *
 * Cada fornecedor devolve o mesmo dado de um jeito: o servidor autoritativo
 * da casa (PowerDNS) usa a forma de apresentação do arquivo de zona — TXT
 * entre aspas e em pedaços, nome de host com ponto final —, o serviço externo
 * devolve o texto lógico. Uma versão guardada de um lado e restaurada do
 * outro só funciona se as duas formas virarem uma só antes de comparar e de
 * guardar, e se cada adaptador converter de volta ao escrever.
 */

const TIPOS_COM_HOST_NO_FIM = new Set(["CNAME", "MX", "NS", "SRV"]);

/**
 * `"abc" "def"` → `abcdef`, desfazendo os escapes do arquivo de zona
 * (RFC 1035 §5.1): `\X` é o caractere X e `\DDD` é um byte em decimal. Os
 * bytes são remontados em UTF-8 no fim, para `\195\169` voltar a ser "é".
 * Texto sem aspas fica como está.
 */
function txtLogico(conteudo: string): string {
  const cru = conteudo.trim();
  if (!cru.startsWith('"')) return conteudo;

  const codificador = new TextEncoder();
  const bytes: number[] = [];
  let dentro = false;
  let achouAspas = false;
  for (let i = 0; i < cru.length; i++) {
    const c = cru[i];
    if (c === '"') {
      dentro = !dentro;
      achouAspas = true;
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
  return achouAspas ? new TextDecoder().decode(new Uint8Array(bytes)) : conteudo;
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

export function conteudoLogico(tipo: string, conteudo: string): string {
  const t = tipo.toUpperCase();
  if (t === "TXT") return txtLogico(conteudo);
  if (TIPOS_COM_HOST_NO_FIM.has(t)) return semPontoNoAlvo(conteudo);
  return conteudo.trim();
}

/**
 * Divide em pedaços de até 255 **bytes** (RFC 1035 §3.3: cada string de
 * caractere tem um byte de tamanho), sem cortar um caractere de vários bytes
 * no meio. Contar caracteres deixaria "é" × 200 num pedaço de 400 bytes.
 */
export function pedacosDe255Bytes(texto: string): string[] {
  const codificador = new TextEncoder();
  const pedacos: string[] = [];
  let atual = "";
  let bytes = 0;
  for (const caractere of texto) {
    const tamanho = codificador.encode(caractere).length;
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
 * de controle (quebra de linha, tab, DEL) vira `\DDD`, senão o registro sai
 * com uma quebra de linha no meio e o arquivo de zona fica inválido.
 */
function escaparPedaco(pedaco: string): string {
  let saida = "";
  for (const caractere of pedaco) {
    const codigo = caractere.codePointAt(0)!;
    if (caractere === "\\" || caractere === '"') saida += `\\${caractere}`;
    else if (codigo < 0x20 || codigo === 0x7f) saida += `\\${String(codigo).padStart(3, "0")}`;
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

/** Conteúdo lógico na forma que o servidor autoritativo e o arquivo de zona exigem. */
export function conteudoDeApresentacao(tipo: string, conteudo: string): string {
  const t = tipo.toUpperCase();
  if (t === "TXT") return conteudo.trim().startsWith('"') ? conteudo.trim() : txtEmAspas(conteudo);
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
