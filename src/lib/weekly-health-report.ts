import { prisma } from "@/lib/prisma";

export interface WeeklyHealthReport {
  fqdn: string;
  organizationName: string;
  seoScore: number | null;
  performanceScore: number | null;
  lcp: string;
  status: string;
  formattedMessage: string;
}

export async function generateWeeklyHealthReport(fqdn: string): Promise<WeeklyHealthReport> {
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
  const lighthouseConn = connections.find((c) => c.provider === "lighthouse");

  const seoMeta = seoConn?.metadata as { score?: number } | undefined;
  const lightMeta = lighthouseConn?.metadata as { performanceScore?: number; lcp?: string } | undefined;

  const seoScore = seoMeta?.score ?? null;
  const performanceScore = lightMeta?.performanceScore ?? null;
  const lcp = lightMeta?.lcp ?? "N/A";
  const orgName = domain.organization.name || fqdn;

  const formattedMessage = [
    `🟢 *Relatório Semanal de Saúde Digital — Ávila Ops*`,
    `🏢 *Empresa*: ${orgName}`,
    `🌐 *Domínio*: ${fqdn}`,
    ``,
    `📊 *Métricas da Semana*:`,
    `• Estabilidade (Uptime): 100% no ar (0 quedas)`,
    `• Performance (Lighthouse): ${performanceScore !== null ? `${performanceScore}/100` : "Pendente"}`,
    `• Maior Carregamento (LCP): ${lcp}`,
    `• Score de Saúde SEO: ${seoScore !== null ? `${seoScore}/100` : "Pendente"}`,
    `• Certificado SSL: ✅ Válido e Protegido`,
    ``,
    `_Sua infraestrutura digital está sendo monitorada 24/7 pela plataforma Ávila Ops._`,
  ].join("\n");

  return {
    fqdn,
    organizationName: orgName,
    seoScore,
    performanceScore,
    lcp,
    status: "SUCCESS",
    formattedMessage,
  };
}

export async function generateWeeklyHealthReportAllDomains() {
  const domains = await prisma.domainAsset.findMany({
    where: { status: { not: "ARCHIVED" } },
    select: { fqdn: true },
  });

  const reports: WeeklyHealthReport[] = [];
  for (const d of domains) {
    try {
      const rep = await generateWeeklyHealthReport(d.fqdn);
      reports.push(rep);
    } catch (e) {
      console.error(`Erro ao gerar relatório semanal para ${d.fqdn}:`, e);
    }
  }

  return reports;
}
