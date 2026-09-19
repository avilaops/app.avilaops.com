/**
 * Publica os arquivos da entrega na borda do Cloudflare, para todos os
 * domínios que dá para alcançar — e diz, domínio a domínio, por que não deu
 * quando não dá.
 *
 * Por que a borda: `robots.txt`, `sitemap.xml` e `llms.txt` só valem servidos
 * do próprio domínio do cliente. O painel não hospeda site de cliente, e pedir
 * acesso à hospedagem de cada um não escala. O Cloudflare, que a casa já
 * gerencia, é o único lugar onde dá para servir esses três no domínio certo
 * sem tocar em nada de quem hospeda.
 *
 * O que este módulo NÃO faz, de propósito:
 *
 * - não publica em domínio que não passa pelo Cloudflare (nuvem cinza ou fora
 *   da conta): sem proxy não há borda onde interceptar, e dizer "aplicado"
 *   nesse caso seria a mesma mentira que este trabalho veio corrigir;
 * - não sombreia arquivo que o site já serve. Antes de publicar, cada caminho
 *   é conferido ao vivo; o que já responde fica como está.
 */
import { prisma } from "@/lib/prisma";
import {
  apagarRotaWorker,
  criarRotaWorker,
  listarRotasWorker,
  publicarScriptWorker,
} from "@/lib/cloudflare";
import { arquivosDoSite, type ArquivoEntrega } from "./conteudo";
import type { ResultadoEntrega, SituacaoDominio } from "./tipos";
import { fonteDoWorker, NOME_WORKER, rotasDoDominio, type MapaEntrega } from "./worker-fonte";

export const PROVIDER_ENTREGA = "entrega_borda";

export type { MotivoForaDeAlcance, ResultadoEntrega, SituacaoDominio } from "./tipos";

const TIMEOUT_MS = 8000;
const USER_AGENT = "AvilaOpsEntrega/1.0 (+https://avilaops.com)";

/**
 * Um caminho conta como "já servido" quando responde 200 com corpo e com um
 * tipo que faz sentido. Site que devolve a página de erro em HTML com status
 * 200 — o que é comum — não conta: aceitar isso deixaria o cliente sem
 * robots.txt achando que tem.
 */
async function jaServido(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/plain,application/xml,*/*" },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status !== 200) return false;
    const tipo = (res.headers.get("content-type") ?? "").toLowerCase();
    if (tipo.includes("text/html")) return false;
    const corpo = await res.text();
    return corpo.trim().length > 0;
  } catch {
    return false;
  }
}

/** Confere, depois de publicar, que a resposta veio mesmo da nossa borda. */
async function confirmaBorda(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.status === 200 && res.headers.get("x-avila-entrega") === "1";
  } catch {
    return false;
  }
}

type DominioComZona = {
  fqdn: string;
  empresa: string;
  zoneId: string | null;
  temProxy: boolean;
};

async function levantarDominios(apenas?: string[]): Promise<DominioComZona[]> {
  const dominios = await prisma.domainAsset.findMany({
    where: {
      status: { not: "ARCHIVED" },
      ...(apenas?.length ? { fqdn: { in: apenas } } : {}),
    },
    include: {
      organization: { select: { name: true } },
      dnsRecords: { select: { type: true, name: true, proxied: true } },
    },
    orderBy: { fqdn: "asc" },
  });

  return dominios.map((dominio) => ({
    fqdn: dominio.fqdn,
    empresa: dominio.organization.name,
    zoneId: dominio.cloudflareZoneId,
    // Só o registro da raiz importa: é nele que a rota da entrega bate.
    temProxy: dominio.dnsRecords.some(
      (registro) =>
        registro.proxied &&
        registro.name.toLowerCase() === dominio.fqdn.toLowerCase() &&
        (registro.type === "A" || registro.type === "AAAA" || registro.type === "CNAME"),
    ),
  }));
}

/**
 * @param ensaio quando true, apura tudo e monta o plano sem enviar nada ao
 * Cloudflare. É como a tela mostra o que aconteceria antes de alguém mandar
 * publicar de verdade.
 */
export async function publicarEntrega(
  { apenas, ensaio = false }: { apenas?: string[]; ensaio?: boolean } = {},
): Promise<ResultadoEntrega> {
  const dominios = await levantarDominios(apenas);
  const situacoes: SituacaoDominio[] = [];
  const mapa: MapaEntrega = {};
  const porZona = new Map<string, { fqdn: string; arquivos: ArquivoEntrega[] }[]>();

  for (const dominio of dominios) {
    const base: SituacaoDominio = {
      fqdn: dominio.fqdn,
      empresa: dominio.empresa,
      zoneId: dominio.zoneId,
      foraDeAlcance: null,
      jaServidos: [],
      publicados: [],
      confirmados: [],
    };

    if (!dominio.zoneId) {
      situacoes.push({ ...base, foraDeAlcance: "sem-zona" });
      continue;
    }
    if (!dominio.temProxy) {
      situacoes.push({ ...base, foraDeAlcance: "sem-proxy" });
      continue;
    }

    const todos = arquivosDoSite({ fqdn: dominio.fqdn, empresa: dominio.empresa });
    const faltando: ArquivoEntrega[] = [];
    for (const arquivo of todos) {
      if (await jaServido(`https://${dominio.fqdn}${arquivo.caminho}`)) {
        base.jaServidos.push(arquivo.caminho);
      } else {
        faltando.push(arquivo);
      }
    }

    base.publicados = faltando.map((a) => a.caminho);
    situacoes.push(base);

    if (faltando.length) {
      mapa[dominio.fqdn] = faltando;
      const daZona = porZona.get(dominio.zoneId) ?? [];
      daZona.push({ fqdn: dominio.fqdn, arquivos: faltando });
      porZona.set(dominio.zoneId, daZona);
    }
  }

  const resultado: ResultadoEntrega = {
    executadoEm: new Date().toISOString(),
    aplicado: false,
    dominios: situacoes,
  };

  if (ensaio || Object.keys(mapa).length === 0) {
    await gravar(resultado);
    return resultado;
  }

  // Um script para todos os domínios: o mapa inteiro vai junto, e a rota é que
  // decide quem chega até ele.
  await publicarScriptWorker(NOME_WORKER, fonteDoWorker(mapa));

  for (const [zoneId, dominiosDaZona] of porZona) {
    const existentes = await listarRotasWorker(zoneId);
    const nossas = existentes.filter((rota) => rota.script === NOME_WORKER);
    const desejadas = new Set(
      dominiosDaZona.flatMap(({ fqdn, arquivos }) => rotasDoDominio(fqdn, arquivos)),
    );

    for (const rota of nossas) {
      if (!desejadas.has(rota.pattern)) await apagarRotaWorker(zoneId, rota.id);
    }
    const jaExistem = new Set(nossas.map((rota) => rota.pattern));
    for (const pattern of desejadas) {
      if (!jaExistem.has(pattern)) await criarRotaWorker(zoneId, pattern, NOME_WORKER);
    }
  }

  resultado.aplicado = true;

  // Publicar não é o mesmo que estar no ar: a confirmação vem de buscar a URL
  // e ver o cabeçalho que só a nossa borda põe.
  for (const situacao of resultado.dominios) {
    for (const caminho of situacao.publicados) {
      if (await confirmaBorda(`https://${situacao.fqdn}${caminho}`)) {
        situacao.confirmados.push(caminho);
      }
    }
  }

  await gravar(resultado);
  return resultado;
}

async function gravar(resultado: ResultadoEntrega): Promise<void> {
  for (const situacao of resultado.dominios) {
    const status = situacao.foraDeAlcance
      ? "WARNING"
      : situacao.publicados.length === situacao.confirmados.length
        ? "ACTIVE"
        : "WARNING";
    await prisma.integrationConnection.upsert({
      where: { provider_siteUrl: { provider: PROVIDER_ENTREGA, siteUrl: situacao.fqdn } },
      create: {
        provider: PROVIDER_ENTREGA,
        siteUrl: situacao.fqdn,
        status,
        lastSyncedAt: new Date(),
        lastSyncStatus: resultado.aplicado ? "SUCCESS" : "UNKNOWN",
        metadata: JSON.parse(JSON.stringify({ ...situacao, executadoEm: resultado.executadoEm })),
      },
      update: {
        status,
        lastSyncedAt: new Date(),
        lastSyncStatus: resultado.aplicado ? "SUCCESS" : "UNKNOWN",
        lastSyncError: situacao.erro ?? null,
        metadata: JSON.parse(JSON.stringify({ ...situacao, executadoEm: resultado.executadoEm })),
      },
    });
  }
}
