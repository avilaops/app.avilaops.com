import { prisma } from "@/lib/prisma";

/**
 * Etapas do onboarding que o próprio sistema fecha.
 *
 * As seis primeiras são as da ficha (o operador marca à mão); as seis últimas
 * nascem das ações do painel de provisionamento e são marcadas pelo código
 * que executou a ação. Quem cria a primeira etapa de uma organização semeia
 * todas, para a aba "Visão geral" da ficha continuar mostrando a lista
 * inteira em vez de só a etapa recém-marcada.
 */
export const ETAPAS = [
  ["BASIC", "Cadastro básico"],
  ["COMPLETE_DATA", "Dados completos"],
  ["IDENTITY", "Identidade"],
  ["SITE", "Site"],
  ["INTEGRATIONS", "Integrações"],
  ["PUBLISHED", "Publicação"],
  ["ACCESS", "Acesso ao painel"],
  ["DOMAIN", "Domínio na Cloudflare"],
  ["EMAIL", "E-mail profissional"],
  ["GOOGLE", "Google (GA4, GTM, Search Console)"],
  ["STORE", "Loja virtual"],
  ["BILLING", "Cobrança recorrente"],
] as const;

export type EtapaKey = (typeof ETAPAS)[number][0];

/** Uma etapa de provisionamento também fecha a etapa "grande" da ficha. */
const ARRASTA: Partial<Record<EtapaKey, EtapaKey>> = {
  GOOGLE: "INTEGRATIONS",
  STORE: "SITE",
};

async function semear(organizationId: string) {
  const existentes = await prisma.organizationOnboardingStep.count({ where: { organizationId } });
  if (existentes > 0) return;
  await prisma.organizationOnboardingStep.createMany({
    data: ETAPAS.map(([stepKey, label], index) => ({
      organizationId,
      stepKey,
      label,
      status: "PENDING",
      sortOrder: index,
    })),
    skipDuplicates: true,
  });
}

/**
 * Marca a etapa como concluída, com a evidência em `notes`. Idempotente:
 * marcar de novo só atualiza a nota. Nunca lança — etapa é registro, não
 * pode derrubar a ação que acabou de dar certo.
 */
export async function marcarEtapa(organizationId: string, chave: EtapaKey, nota?: string) {
  try {
    await semear(organizationId);
    const alvos: EtapaKey[] = [chave];
    const arrasto = ARRASTA[chave];
    if (arrasto) alvos.push(arrasto);

    for (const stepKey of alvos) {
      const label = ETAPAS.find(([k]) => k === stepKey)?.[1] ?? stepKey;
      const sortOrder = ETAPAS.findIndex(([k]) => k === stepKey);
      await prisma.organizationOnboardingStep.upsert({
        where: { organizationId_stepKey: { organizationId, stepKey } },
        create: {
          organizationId,
          stepKey,
          label,
          status: "DONE",
          completedAt: new Date(),
          notes: nota ?? null,
          sortOrder: sortOrder < 0 ? 99 : sortOrder,
        },
        update: {
          status: "DONE",
          completedAt: new Date(),
          ...(nota && stepKey === chave ? { notes: nota } : {}),
        },
      });
    }
  } catch (erro) {
    console.error(`[onboarding] não marcou a etapa ${chave} de ${organizationId}`, erro);
  }
}
