import { isIP } from "node:net";
import { daApresentacao, ehDoServidor, normalizarCanonico } from "@/lib/dominios/dns/conteudo";
import { tipoDnsValido, type RegistroDns } from "@/lib/dominios/dns/tipos";
import { nomeCompleto, validarRegistroDns } from "@/lib/dominios/dns/validacao";
import { ordenarLinhas, paraEntrada, type LinhaVersao } from "@/lib/dominios/dns/versoes";

/**
 * Lê um arquivo de zona no formato do BIND (RFC 1035 §5.1) e devolve as
 * linhas do titular na forma canônica, prontas para comparar com a zona e
 * aplicar como se fosse uma versão.
 *
 * É a porta de entrada de quem traz o domínio de outro provedor: o arquivo
 * exportado lá vira a zona aqui, sem redigitar registro por registro. Por
 * isso o leitor é estrito no que muda a zona e honesto no que deixa de fora:
 *
 * - SOA e NS do próprio domínio ficam de fora — são de quem serve a zona;
 * - tipo que o painel não gerencia (PTR, DS, TLSA…) fica de fora, listado;
 * - `$INCLUDE` e `$GENERATE` são recusados: o arquivo inteiro tem de estar
 *   aqui, e expandir modelo é adivinhar;
 * - nome fora do domínio, classe que não é IN e linha que não se entende são
 *   **problemas**: com qualquer um deles, nada é aplicado.
 *
 * Pura: não lê banco nem rede.
 */

export type LinhaIgnorada = { linha: number; texto: string; motivo: string };
export type ProblemaImportacao = { linha: number; texto: string; mensagem: string };

export type ResultadoImportacao = {
  linhas: LinhaVersao[];
  ignoradas: LinhaIgnorada[];
  problemas: ProblemaImportacao[];
};

/** Limites do que se aceita colar ou enviar: uma zona de pequena empresa cabe com folga. */
export const LIMITE_BYTES = 256 * 1024;
export const LIMITE_REGISTROS = 2000;

type Token = { texto: string; aspas: boolean };
type LinhaLogica = { numero: number; recuada: boolean; tokens: Token[]; original: string };

/** Quebra o arquivo em linhas lógicas: parênteses juntam linhas, `;` fora de aspas é comentário. */
function linhasLogicas(texto: string): { linhas: LinhaLogica[]; problemas: ProblemaImportacao[] } {
  const linhas: LinhaLogica[] = [];
  const problemas: ProblemaImportacao[] = [];
  const fisicas = texto.replace(/\r\n?/g, "\n").split("\n");

  let atual: LinhaLogica | null = null;
  let parenteses = 0;
  let token: Token | null = null;
  let aspas = false;

  const fecharToken = () => {
    if (token) atual!.tokens.push(token);
    token = null;
  };

  for (let n = 0; n < fisicas.length; n++) {
    const fisica = fisicas[n];
    if (!atual) atual = { numero: n + 1, recuada: /^[ \t]/.test(fisica), tokens: [], original: fisica.trim() };
    else atual.original += ` ${fisica.trim()}`;

    for (let i = 0; i < fisica.length; i++) {
      const c = fisica[i];
      if (aspas) {
        if (c === "\\" && i + 1 < fisica.length) {
          token!.texto += c + fisica[i + 1];
          i++;
        } else if (c === '"') {
          token!.texto += c;
          aspas = false;
          fecharToken();
        } else token!.texto += c;
        continue;
      }
      if (c === ";") break;
      if (c === '"') {
        fecharToken();
        token = { texto: '"', aspas: true };
        aspas = true;
        continue;
      }
      if (c === "(" || c === ")") {
        fecharToken();
        parenteses += c === "(" ? 1 : -1;
        continue;
      }
      if (c === " " || c === "\t") {
        fecharToken();
        continue;
      }
      if (c === "\\" && i + 1 < fisica.length) {
        token = token ?? { texto: "", aspas: false };
        token.texto += c + fisica[i + 1];
        i++;
        continue;
      }
      token = token ?? { texto: "", aspas: false };
      token.texto += c;
    }

    if (aspas) {
      // Aspas abertas atravessando a quebra de linha: o BIND recusa, e nós também.
      problemas.push({ linha: atual.numero, texto: atual.original, mensagem: "Aspas abertas e não fechadas na mesma linha." });
      aspas = false;
      token = null;
      // A linha toda é descartada: lida pela metade, viraria um segundo problema enganoso.
      atual.tokens = [];
      parenteses = 0;
    }
    if (parenteses > 0 && n < fisicas.length - 1) continue;
    if (parenteses !== 0) {
      problemas.push({ linha: atual.numero, texto: atual.original, mensagem: "Parênteses não fecham." });
      parenteses = 0;
    }
    fecharToken();
    if (atual.tokens.length) linhas.push(atual);
    atual = null;
  }
  return { linhas, problemas };
}

const UNIDADE: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86_400, w: 604_800 };

/** `3600`, `1h`, `1h30m` → segundos. Nulo se não for TTL. */
export function lerTtl(texto: string): number | null {
  if (/^\d+$/.test(texto)) return Number(texto);
  const partes = [...texto.toLowerCase().matchAll(/(\d+)([smhdw])/g)];
  if (!partes.length || partes.map((p) => p[0]).join("") !== texto.toLowerCase()) return null;
  return partes.reduce((s, p) => s + Number(p[1]) * UNIDADE[p[2]], 0);
}

function absoluto(nome: string, origem: string): string {
  if (nome === "@") return origem;
  if (nome.endsWith(".")) return nome.slice(0, -1).toLowerCase();
  return `${nome}.${origem}`.toLowerCase();
}

function dentroDaZona(nome: string, zona: string) {
  return nome === zona || nome.endsWith(`.${zona}`);
}

const TIPOS_COM_PRIORIDADE = new Set(["MX", "SRV"]);
const TIPOS_COM_ALVO = new Set(["CNAME", "NS", "MX", "SRV"]);

export function lerZonaBind(texto: string, zona: string): ResultadoImportacao {
  const raiz = zona.trim().toLowerCase().replace(/\.$/, "");
  const ignoradas: LinhaIgnorada[] = [];
  const problemas: ProblemaImportacao[] = [];
  const linhas: LinhaVersao[] = [];

  if (new TextEncoder().encode(texto).length > LIMITE_BYTES) {
    return { linhas, ignoradas, problemas: [{ linha: 0, texto: "", mensagem: `O arquivo passa de ${LIMITE_BYTES / 1024} KB.` }] };
  }

  const lidas = linhasLogicas(texto);
  problemas.push(...lidas.problemas);

  let origem = raiz;
  let ttlPadrao: number | null = null;
  let ultimoDono: string | null = null;
  let ultimoTtl: number | null = null;

  for (const l of lidas.linhas) {
    const problema = (mensagem: string) => problemas.push({ linha: l.numero, texto: l.original, mensagem });
    const t = l.tokens.map((x) => x.texto);

    if (t[0].startsWith("$")) {
      const diretiva = t[0].toUpperCase();
      if (diretiva === "$ORIGIN" && t[1]) {
        const nova = absoluto(t[1], origem);
        if (!dentroDaZona(nova, raiz)) problema(`$ORIGIN ${t[1]} fica fora de ${raiz}.`);
        else origem = nova;
      } else if (diretiva === "$TTL" && t[1] && lerTtl(t[1]) !== null) {
        ttlPadrao = lerTtl(t[1]);
      } else if (diretiva === "$INCLUDE" || diretiva === "$GENERATE") {
        problema(`${diretiva} não é aceito: envie o arquivo com todos os registros escritos.`);
      } else {
        problema(`Diretiva que não se entende: ${t[0]}.`);
      }
      continue;
    }

    // [dono] [ttl] [classe] tipo dados — TTL e classe em qualquer ordem.
    let i = 0;
    let dono: string;
    if (l.recuada) {
      if (!ultimoDono) {
        problema("Linha sem nome e sem registro anterior de onde herdar o nome.");
        continue;
      }
      dono = ultimoDono;
    } else {
      dono = absoluto(t[0], origem);
      i = 1;
    }
    let ttl: number | null = null;
    let classe = "IN";
    for (let k = 0; k < 2 && i < t.length; k++) {
      const ttlLido = l.tokens[i].aspas ? null : lerTtl(t[i]);
      if (ttlLido !== null && ttl === null) {
        ttl = ttlLido;
        i++;
      } else if (/^(IN|CH|HS|CS)$/i.test(t[i])) {
        classe = t[i].toUpperCase();
        i++;
      }
    }
    const tipo = (t[i] ?? "").toUpperCase();
    const dados = l.tokens.slice(i + 1);

    if (!tipo || !/^[A-Z][A-Z0-9-]*$/.test(tipo)) {
      problema("Não foi possível ler o tipo do registro.");
      continue;
    }
    ultimoDono = dono;
    if (ttl === null) ttl = ttlPadrao ?? ultimoTtl;
    ultimoTtl = ttl;

    if (classe !== "IN") {
      problema(`Classe ${classe}: só registros IN entram na zona.`);
      continue;
    }
    if (!dentroDaZona(dono, raiz)) {
      problema(`${dono} não é de ${raiz}.`);
      continue;
    }
    if (ehDoServidor({ tipo, nome: dono }, raiz)) {
      ignoradas.push({ linha: l.numero, texto: l.original, motivo: tipo === "SOA" ? "SOA é do servidor que hospeda a zona." : "Os NS do próprio domínio são definidos no registro do domínio." });
      continue;
    }
    if (!tipoDnsValido(tipo)) {
      ignoradas.push({ linha: l.numero, texto: l.original, motivo: `${tipo} não é gerenciado pelo painel.` });
      continue;
    }
    if (ttl === null) {
      problema("Registro sem TTL, e o arquivo não tem $TTL antes dele.");
      continue;
    }
    if (!dados.length) {
      problema(`${tipo} sem dados.`);
      continue;
    }

    let prioridade: number | null = null;
    let resto = dados;
    if (TIPOS_COM_PRIORIDADE.has(tipo)) {
      if (!/^\d+$/.test(resto[0].texto)) {
        problema(`${tipo} começa pela prioridade, um número.`);
        continue;
      }
      prioridade = Number(resto[0].texto);
      resto = resto.slice(1);
    }

    let conteudo: string;
    if (tipo === "TXT") {
      // Palavra sem aspas é uma string de caractere, como no BIND.
      conteudo = daApresentacao(
        "TXT",
        resto.map((x) => (x.aspas ? x.texto : `"${x.texto.replace(/"/g, '\\"')}"`)).join(" "),
      );
    } else {
      const partes = resto.map((x) => x.texto);
      if (TIPOS_COM_ALVO.has(tipo) && partes.length) {
        const alvo = partes[partes.length - 1];
        // IP no lugar de nome (MX para IP, CNAME para IP) não ganha a origem:
        // virar "203.0.113.9.padaria.com.br" esconderia o erro da validação.
        partes[partes.length - 1] = alvo === "." || isIP(alvo) ? alvo : absoluto(alvo, origem);
      }
      conteudo = normalizarCanonico(tipo, partes.join(" "));
    }

    linhas.push({ tipo, nome: dono, conteudo, ttl, prioridade, proxy: false });
  }

  if (linhas.length > LIMITE_REGISTROS) {
    problemas.push({ linha: 0, texto: "", mensagem: `O arquivo tem mais de ${LIMITE_REGISTROS} registros.` });
  }
  return { linhas: ordenarLinhas(linhas), ignoradas, problemas };
}

/**
 * As regras do painel (SPF duplicado, CNAME dividindo nome, MX para IP, TTL)
 * aplicadas à zona que o arquivo quer deixar: cada linha contra as outras do
 * mesmo arquivo, não contra a zona de hoje, que vai ser substituída.
 */
export function validarZonaImportada(linhas: LinhaVersao[], zona: string, permiteCnameNoApex: boolean): string[] {
  const comId: RegistroDns[] = linhas.map((l, i) => ({ id: `importada-${i}`, ...l }));
  return comId.flatMap((registro) =>
    validarRegistroDns(paraEntrada(registro), {
      zona,
      existentes: comId,
      substituindoId: registro.id,
      permiteCnameNoApex,
    }).map((p) => `${registro.tipo} ${nomeCompleto(registro.nome, zona)}: ${p.mensagem}`),
  ).filter((m, i, todas) => todas.indexOf(m) === i);
}
