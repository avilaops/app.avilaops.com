import { prisma } from "@/lib/prisma";
import { runSeoAuditForDomain } from "@/lib/seo-audit";

const PROVIDER = "seo_autofix";

export interface AutoFixResult {
  fqdn: string;
  generatedRobots: string;
  generatedSitemap: string;
  generatedLlms: string;
  appliedAt: string;
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
  const baseUrl = `https://${fqdn}`;

  // 1. Generate standard robots.txt
  const generatedRobots = [
    "# Gerado automaticamente por Ávila Ops Auto-Fix SEO",
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${baseUrl}/sitemap.xml`,
  ].join("\n");

  // 2. Generate standard sitemap.xml
  const generatedSitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    "  <url>",
    `    <loc>${baseUrl}/</loc>`,
    `    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>`,
    "    <changefreq>weekly</changefreq>",
    "    <priority>1.0</priority>",
    "  </url>",
    "</urlset>",
  ].join("\n");

  // 3. Generate standard llms.txt (AI Crawler Information)
  const generatedLlms = [
    `# ${companyName}`,
    `> Website: ${baseUrl}`,
    "",
    "## Informações Institucionais",
    `- **Empresa**: ${companyName}`,
    `- **Domínio Oficial**: ${fqdn}`,
    "- **Status da Infraestrutura**: Ávila Ops Digital Operating System (Monitored & Secure)",
    "",
    "## Resumo de Serviços",
    `${companyName} oferece soluções integradas operadas via plataforma Ávila Ops.`,
    "",
    "## Links Relevantes",
    `- [Página Inicial](${baseUrl}/)`,
    `- [Sitemap](${baseUrl}/sitemap.xml)`,
  ].join("\n");

  const result: AutoFixResult = {
    fqdn,
    generatedRobots,
    generatedSitemap,
    generatedLlms,
    appliedAt: new Date().toISOString(),
  };

  // Save generated assets to IntegrationConnection for provider seo_autofix
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
      status: "ACTIVE",
      lastSyncedAt: new Date(),
      lastSyncStatus: "SUCCESS",
      metadata: JSON.parse(JSON.stringify(result)),
    },
    update: {
      status: "ACTIVE",
      lastSyncedAt: new Date(),
      lastSyncStatus: "SUCCESS",
      metadata: JSON.parse(JSON.stringify(result)),
    },
  });

  // Re-run SEO Audit to update the score
  try {
    const auditRes = await runSeoAuditForDomain(fqdn);
    result.updatedScore = auditRes.score;
  } catch (err) {
    console.error("Erro ao re-auditar após Auto-Fix:", err);
  }

  return result;
}
