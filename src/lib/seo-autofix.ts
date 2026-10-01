/**
 * O "Auto-Fix SEO" — agora com o verbo valendo o que diz.
 *
 * Até 19/09/2026 esta função gerava o texto dos três arquivos, gravava numa
 * linha de `integrationConnection` e devolvia sucesso. O site do cliente
 * continuava sem `robots.txt`, sem `sitemap.xml` e sem `llms.txt`: a
 * auditoria seguinte reprovava exatamente os mesmos itens, e três telas
 * diferentes anunciavam "aplicado com sucesso" em cima disso.
 *
 * O que ela faz hoje: publica os arquivos na borda do Cloudflare
 * (`entrega/publicar.ts`), guarda a situação apurada domínio a domínio e
 * re-audita. Quando não dá para publicar — domínio fora da conta, ou sem
 * proxy — o resultado diz o motivo em vez de inventar sucesso.
 */
import { publicarEntrega } from "@/lib/entrega/publicar";
import type { SituacaoDominio } from "@/lib/entrega/tipos";
import { arquivosDoSite } from "@/lib/entrega/conteudo";
import { prisma } from "@/lib/prisma";
import { runSeoAuditForDomain } from "@/lib/seo-audit";

const PROVIDER = "seo_autofix";

export interface AutoFixResult {
  fqdn: string;
  generatedRobots: string;
  generatedSitemap: string;
  generatedLlms: string;
  appliedAt: string;
  /** O que aconteceu na borda. É esta a evidência de que foi aplicado. */
  entrega: SituacaoDominio;
  updatedScore?: number;
}

export async function generateAndApplySeoAutoFix(fqdn: string): Promise<AutoFixResult> {
  const domain = await prisma.domainAsset.findUnique({
    where: { fqdn },
    include: { organization: true },
  });

  if (!domain) {
    throw new Error(`Domínio ${fqdn} não encontrado no banco de dados.`);
  }

  const companyName = domain.organization.name || fqdn;

  // O texto dos três arquivos vem de `entrega/conteudo.ts`, o mesmo módulo que
  // a borda publica. Enquanto viviam aqui, o que a tela mostrava e o que seria
  // servido eram dois textos mantidos à mão em lugares diferentes.
  const [robots, sitemap, llms] = arquivosDoSite({ fqdn, empresa: companyName });

  const publicacao = await publicarEntrega({ apenas: [fqdn] });
  const entrega = publicacao.dominios.find((situacao) => situacao.fqdn === fqdn);
  if (!entrega) {
    throw new Error(`${fqdn} não está entre os domínios ativos: não há o que publicar.`);
  }

  const result: AutoFixResult = {
    fqdn,
    generatedRobots: robots.corpo,
    generatedSitemap: sitemap.corpo,
    generatedLlms: llms.corpo,
    appliedAt: new Date().toISOString(),
    entrega,
  };

  const naBorda = entrega.confirmados.length === entrega.publicados.length && !entrega.foraDeAlcance;

  await prisma.integrationConnection.upsert({
    where: {
      provider_siteUrl: {
        provider: PROVIDER,
        siteUrl: fqdn,
      },
    },
    create: {
      provider: PROVIDER,
      siteUrl: fqdn,
      status: naBorda ? "ACTIVE" : "WARNING",
      lastSyncedAt: new Date(),
      lastSyncStatus: naBorda ? "SUCCESS" : "ERROR",
      lastSyncError: motivo(entrega),
      metadata: JSON.parse(JSON.stringify(result)),
    },
    update: {
      status: naBorda ? "ACTIVE" : "WARNING",
      lastSyncedAt: new Date(),
      lastSyncStatus: naBorda ? "SUCCESS" : "ERROR",
      lastSyncError: motivo(entrega),
      metadata: JSON.parse(JSON.stringify(result)),
    },
  });

  // Re-audita para a nota refletir o que está no ar agora.
  try {
    const auditRes = await runSeoAuditForDomain(fqdn);
    result.updatedScore = auditRes.score;
  } catch (err) {
    console.error("Erro ao re-auditar após Auto-Fix:", err);
  }

  return result;
}

function motivo(entrega: SituacaoDominio): string | null {
  if (entrega.erro) return entrega.erro;
  if (entrega.foraDeAlcance === "sem-zona") return "Domínio fora da conta Cloudflare da casa.";
  if (entrega.foraDeAlcance === "sem-proxy") return "Domínio sem proxy: o tráfego não passa pela borda.";
  const faltando = entrega.publicados.filter((caminho) => !entrega.confirmados.includes(caminho));
  return faltando.length ? `Publicado sem resposta pela borda: ${faltando.join(", ")}.` : null;
}
