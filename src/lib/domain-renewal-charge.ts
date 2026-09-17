import { prisma } from "@/lib/prisma";

const RENEWAL_PROVIDER = "domain_renewal";
const STANDARD_RENEWAL_FEE = 89.90; // Valor padrão de renovação anual do domínio

export interface DomainRenewalCheckResult {
  fqdn: string;
  organizationName: string;
  expiresAt: string | null;
  daysRemaining: number | null;
  needsRenewalNotice: boolean;
  renewalFee: number;
  pixNoticeText?: string;
}

export async function checkDomainRenewalStatus(fqdn: string): Promise<DomainRenewalCheckResult> {
  const domain = await prisma.domainAsset.findUnique({
    where: { fqdn },
    include: { organization: true },
  });

  if (!domain) {
    throw new Error(`Domínio ${fqdn} não encontrado.`);
  }

  const now = new Date();
  const expiresAt = domain.expiresAt;
  let daysRemaining: number | null = null;
  let needsRenewalNotice = false;

  if (expiresAt) {
    const diffMs = expiresAt.getTime() - now.getTime();
    daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (daysRemaining <= 30) {
      needsRenewalNotice = true;
    }
  }

  const orgName = domain.organization.name || fqdn;

  const pixNoticeText = needsRenewalNotice
    ? [
        `⚠️ *Aviso de Vencimento de Domínio - Ávila Ops*`,
        `🏢 *Empresa*: ${orgName}`,
        `🌐 *Domínio*: ${fqdn}`,
        `📅 *Vencimento*: ${expiresAt ? expiresAt.toLocaleDateString("pt-BR") : "Em breve"} (${daysRemaining} dias restantes)`,
        `💰 *Valor da Renovação Anual*: R$ ${STANDARD_RENEWAL_FEE.toFixed(2).replace(".", ",")}`,
        ``,
        `Para garantir a continuidade dos serviços e evitar a suspensão do seu site e e-mails, acesse o portal do cliente para efetuar o pagamento via PIX:`,
        `👉 https://app.avilaops.com/portal`,
      ].join("\n")
    : undefined;

  const result: DomainRenewalCheckResult = {
    fqdn,
    organizationName: orgName,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    daysRemaining,
    needsRenewalNotice,
    renewalFee: STANDARD_RENEWAL_FEE,
    pixNoticeText,
  };

  await prisma.integrationConnection.upsert({
    where: {
      provider_siteUrl: {
        provider: RENEWAL_PROVIDER,
        siteUrl: fqdn,
      },
    },
    create: {
      provider: RENEWAL_PROVIDER,
      siteUrl: fqdn,
      status: needsRenewalNotice ? "WARNING" : "ACTIVE",
      lastSyncedAt: new Date(),
      lastSyncStatus: "SUCCESS",
      metadata: JSON.parse(JSON.stringify(result)),
    },
    update: {
      status: needsRenewalNotice ? "WARNING" : "ACTIVE",
      lastSyncedAt: new Date(),
      lastSyncStatus: "SUCCESS",
      metadata: JSON.parse(JSON.stringify(result)),
    },
  });

  return result;
}

export async function checkAllDomainRenewals() {
  const domains = await prisma.domainAsset.findMany({
    where: { status: { not: "ARCHIVED" } },
    select: { fqdn: true },
  });

  const results: DomainRenewalCheckResult[] = [];
  for (const d of domains) {
    try {
      const res = await checkDomainRenewalStatus(d.fqdn);
      results.push(res);
    } catch (e) {
      console.error(`Erro ao checar renovação de ${d.fqdn}:`, e);
    }
  }

  return results;
}
