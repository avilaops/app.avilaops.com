import { prisma } from "@/lib/prisma";

export interface DigitalRecommendation {
  id: string;
  type: "SEO" | "PERFORMANCE" | "SECURITY" | "UPSELL" | "RENEWAL";
  priority: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  description: string;
  actionLabel: string;
  actionType: "AUTOFIX" | "UPSELL" | "RENEW" | "CONTACT";
  estimatedValue?: number;
}

export interface DomainAdvisorAnalysis {
  fqdn: string;
  organizationName: string;
  overallScore: number;
  recommendations: DigitalRecommendation[];
  totalUpsellOpportunity: number;
}

export async function analyzeDomainDigitalHealth(fqdn: string): Promise<DomainAdvisorAnalysis> {
  const domain = await prisma.domainAsset.findUnique({
    where: { fqdn },
    include: { organization: true },
  });

  if (!domain) {
    throw new Error(`Domínio ${fqdn} não encontrado.`);
  }

  const connections = await prisma.integrationConnection.findMany({
    where: { siteUrl: fqdn },
  });

  const seoConn = connections.find((c) => c.provider === "seo_audit");
  const lightConn = connections.find((c) => c.provider === "lighthouse");
  const linkConn = connections.find((c) => c.provider === "link_audit");

  const seoMeta = seoConn?.metadata as Record<string, unknown> | undefined;
  const lightMeta = lightConn?.metadata as Record<string, unknown> | undefined;
  const linkMeta = linkConn?.metadata as Record<string, unknown> | undefined;

  const seoScore = typeof seoMeta?.score === "number" ? seoMeta.score : 50;
  const perfScore = typeof lightMeta?.performanceScore === "number" ? lightMeta.performanceScore : 50;
  const brokenLinks = typeof linkMeta?.brokenLinksCount === "number" ? linkMeta.brokenLinksCount : 0;

  const recommendations: DigitalRecommendation[] = [];
  let totalUpsell = 0;

  // 1. Check SEO Auto-Fix
  if (seoScore < 75) {
    recommendations.push({
      id: "seo_autofix",
      type: "SEO",
      priority: seoScore < 45 ? "HIGH" : "MEDIUM",
      title: "Score de SEO Técnico pode ser melhorado",
      description: `O score atual é ${seoScore}/100. Execute o Auto-Fix SEO para gerar robots.txt, sitemap.xml e llms.txt.`,
      actionLabel: "⚡ Executar Auto-Fix SEO",
      actionType: "AUTOFIX",
    });
  }

  // 2. Check Performance / Cloudflare CDN
  if (perfScore < 80) {
    totalUpsell += 149.0;
    recommendations.push({
      id: "perf_cdn",
      type: "PERFORMANCE",
      priority: perfScore < 50 ? "HIGH" : "MEDIUM",
      title: "Otimização de Velocidade e Imagens R2",
      description: `A performance atual é ${perfScore}/100. Ativar compressão WebP e CDN de borda Cloudflare R2.`,
      actionLabel: "Ativar Add-on de Performance (+R$ 149,00)",
      actionType: "UPSELL",
      estimatedValue: 149.0,
    });
  }

  // 3. Check Broken Links
  if (brokenLinks > 0) {
    recommendations.push({
      id: "broken_links",
      type: "SECURITY",
      priority: brokenLinks > 2 ? "HIGH" : "MEDIUM",
      title: `${brokenLinks} link(s) quebrado(s) detectado(s)`,
      description: "Links quebrados prejudicam o ranking no Google e a experiência do cliente.",
      actionLabel: "Corrigir Links Internos",
      actionType: "AUTOFIX",
    });
  }

  // 4. Upsell: WhatsApp Business & Automações
  totalUpsell += 299.0;
  recommendations.push({
    id: "whatsapp_bot",
    type: "UPSELL",
    priority: "LOW",
    title: "Automação de Atendimento WhatsApp Business",
    description: "Conecte o bot de inteligência artificial para responder clientes 24/7 e aumentar conversões.",
    actionLabel: "Oferecer Automação WhatsApp (+R$ 299,00/mês)",
    actionType: "UPSELL",
    estimatedValue: 299.0,
  });

  const overallScore = Math.round((seoScore + perfScore) / 2);

  return {
    fqdn,
    organizationName: domain.organization.name || fqdn,
    overallScore,
    recommendations,
    totalUpsellOpportunity: totalUpsell,
  };
}
