/**
 * Auditoria do conjunto de ícones de um domínio: busca os arquivos, mede o que
 * dá para medir e grava o resultado, do mesmo jeito que `seo-audit.ts` faz com
 * robots e sitemap.
 *
 * A avaliação em si mora em `padrao.ts`, sem rede: aqui só se coleta. Isso
 * mantém o padrão testável e deixa claro o que é fato observado (respondeu
 * 200, tem 180×180, é opaco) e o que é julgamento (isto passa ou não).
 */
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import {
  ARQUIVO_AUSENTE,
  avaliarPadrao,
  estadoDoPadrao,
  lerCabecaHtml,
  lerManifesto,
  notaDoPadrao,
  pendenciaPrincipal,
  type ArquivoRemoto,
  type ColetaIcones,
  type ItemPadrao,
} from "./padrao";

export const PROVIDER_ICONES = "icone_audit";

const TIMEOUT_MS = 8000;
const USER_AGENT = "AvilaOpsIconAuditor/1.0 (+https://avilaops.com)";
/** Ícone honesto não passa disso; o teto evita puxar um arquivo enorme por engano. */
const BYTES_MAX = 3 * 1024 * 1024;

/** Nomes que o padrão aceita quando o HTML não declara o manifesto. */
const NOMES_MANIFESTO = ["/site.webmanifest", "/manifest.json"] as const;

function tipoLimpo(cabecalho: string | null): string | null {
  if (!cabecalho) return null;
  return cabecalho.split(";")[0]?.trim().toLowerCase() || null;
}

async function buscarTexto(url: string, accept: string) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: accept },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { status: res.status, texto: await res.text(), url: res.url };
  } catch {
    return { status: null as number | null, texto: "", url };
  }
}

/**
 * Lê o diretório de um .ico. O formato é: 6 bytes de cabeçalho (reservado,
 * tipo 1, quantidade) e depois uma entrada de 16 bytes por imagem, onde o
 * primeiro byte é a largura — e 0 significa 256.
 */
function lerIco(buffer: Buffer): { ehIco: boolean; lados: number[] } {
  if (buffer.length < 6) return { ehIco: false, lados: [] };
  const reservado = buffer.readUInt16LE(0);
  const tipo = buffer.readUInt16LE(2);
  const quantidade = buffer.readUInt16LE(4);
  if (reservado !== 0 || tipo !== 1 || quantidade === 0) return { ehIco: false, lados: [] };
  const lados: number[] = [];
  for (let i = 0; i < quantidade; i++) {
    const base = 6 + i * 16;
    if (base + 1 >= buffer.length) break;
    const largura = buffer.readUInt8(base);
    lados.push(largura === 0 ? 256 : largura);
  }
  return { ehIco: true, lados: [...new Set(lados)].sort((a, b) => a - b) };
}

/** Busca um arquivo de imagem e apura o que o padrão precisa saber sobre ele. */
async function buscarImagem(url: string): Promise<ArquivoRemoto> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "image/*,*/*" },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return ARQUIVO_AUSENTE;
  }

  const contentType = tipoLimpo(res.headers.get("content-type"));
  if (res.status !== 200) {
    return { ...ARQUIVO_AUSENTE, status: res.status, contentType };
  }

  let buffer: Buffer;
  try {
    const dados = await res.arrayBuffer();
    if (dados.byteLength > BYTES_MAX) {
      return { ...ARQUIVO_AUSENTE, status: res.status, contentType, bytes: dados.byteLength };
    }
    buffer = Buffer.from(dados);
  } catch {
    return { ...ARQUIVO_AUSENTE, status: res.status, contentType };
  }

  const ico = lerIco(buffer);
  const base: ArquivoRemoto = {
    status: res.status,
    contentType,
    bytes: buffer.length,
    largura: null,
    altura: null,
    opaco: null,
    ehIco: ico.ehIco,
    ladosIco: ico.lados,
  };

  // O .ico o sharp não abre, e não precisa: o diretório já contou os lados.
  if (ico.ehIco) return base;

  try {
    const imagem = sharp(buffer);
    const meta = await imagem.metadata();
    // `isOpaque` é o que separa um Apple Touch Icon bom de um que o iOS
    // escurece: um PNG pode ter canal alfa e ainda assim ser todo opaco.
    const stats = await imagem.stats();
    return {
      ...base,
      largura: meta.width ?? null,
      altura: meta.height ?? null,
      opaco: stats.isOpaque,
    };
  } catch {
    return base;
  }
}

/** Resolve href relativo contra a página. Devolve null para href inválido. */
function absoluto(href: string | null, base: string): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

export type ResultadoIcones = {
  fqdn: string;
  checkedAt: string;
  nota: number;
  status: "ACTIVE" | "WARNING" | "FAIL";
  pendencia: string | null;
  itens: ItemPadrao[];
  /** Fatos crus, para a folha de evidência mostrar de onde saiu cada item. */
  coleta: ColetaIcones;
};

export async function auditarIconesDoDominio(fqdn: string): Promise<ResultadoIcones> {
  const base = `https://${fqdn}/`;

  const home = await buscarTexto(base, "text/html");
  const cabeca = home.status === 200 ? lerCabecaHtml(home.texto) : null;

  // O manifesto é procurado onde o HTML manda; só quando o HTML não declara é
  // que os dois nomes usuais entram como reserva. Procurar apenas um nome fixo
  // reprova site correto que usa o outro — foi assim que a auditoria de SEO
  // passou a reprovar todo site que seguia a instrução da própria casa.
  const candidatos = [absoluto(cabeca?.manifest ?? null, base), ...NOMES_MANIFESTO.map((n) => absoluto(n, base))]
    .filter((u): u is string => Boolean(u))
    .filter((u, i, lista) => lista.indexOf(u) === i);

  let manifesto: ResultadoIcones["coleta"]["manifesto"] = {
    caminho: null,
    status: null,
    dados: null,
  };
  for (const candidato of candidatos) {
    const res = await buscarTexto(candidato, "application/manifest+json, application/json");
    if (res.status === 200) {
      const dados = lerManifesto(res.texto);
      manifesto = { caminho: new URL(candidato).pathname, status: res.status, dados };
      if (dados) break;
    } else if (manifesto.status === null) {
      manifesto = { caminho: new URL(candidato).pathname, status: res.status, dados: null };
    }
  }

  // O Apple Touch Icon é buscado onde o HTML declara; sem declaração, tenta o
  // caminho padrão, para o relatório dizer "existe mas não está declarado" em
  // vez de simplesmente "não existe".
  const urlApple = absoluto(cabeca?.appleTouchIcon ?? "/apple-touch-icon.png", base);
  const urlOg = absoluto(cabeca?.ogImage ?? null, base);

  const [faviconRaiz, appleTouch, ogImage] = await Promise.all([
    buscarImagem(absoluto("/favicon.ico", base)!),
    urlApple ? buscarImagem(urlApple) : Promise.resolve(ARQUIVO_AUSENTE),
    urlOg ? buscarImagem(urlOg) : Promise.resolve(ARQUIVO_AUSENTE),
  ]);

  const iconesManifesto = await Promise.all(
    (manifesto.dados?.icones ?? []).map((icone) => {
      const url = absoluto(icone.src, manifesto.caminho ? new URL(manifesto.caminho, base).toString() : base);
      return url ? buscarImagem(url) : Promise.resolve(ARQUIVO_AUSENTE);
    }),
  );

  const coleta: ColetaIcones = {
    html: { status: home.status, cabeca, urlFinal: home.url },
    faviconRaiz,
    appleTouch,
    manifesto,
    iconesManifesto,
    ogImage,
  };

  const itens = avaliarPadrao(coleta);
  const nota = notaDoPadrao(itens);
  const resultado: ResultadoIcones = {
    fqdn,
    checkedAt: new Date().toISOString(),
    nota,
    status: estadoDoPadrao(nota),
    pendencia: pendenciaPrincipal(itens),
    itens,
    coleta,
  };

  await prisma.integrationConnection.upsert({
    where: { provider_siteUrl: { provider: PROVIDER_ICONES, siteUrl: fqdn } },
    create: {
      provider: PROVIDER_ICONES,
      siteUrl: fqdn,
      status: resultado.status,
      lastSyncedAt: new Date(),
      lastSyncStatus: resultado.status === "FAIL" ? "WARNING" : "SUCCESS",
      metadata: JSON.parse(JSON.stringify(resultado)),
    },
    update: {
      status: resultado.status,
      lastSyncedAt: new Date(),
      lastSyncStatus: resultado.status === "FAIL" ? "WARNING" : "SUCCESS",
      lastSyncError: null,
      metadata: JSON.parse(JSON.stringify(resultado)),
    },
  });

  return resultado;
}
