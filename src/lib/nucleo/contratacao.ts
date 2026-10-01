import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { agendarEvento } from "@/lib/nucleo/queries";

type Contratacao = {
  organizationId: string; actorId: string; descricao: string; valorCents: number;
  dia: number; ciclo: "MONTHLY" | "YEARLY"; inicio: Date;
  implantacaoCents: number | null; produto: string | null; tenant: string | null;
};

/** Assinatura, condições acordadas, primeiras faturas e evento nascem juntos. */
export async function criarContratacao(params: Contratacao, db: Pick<typeof prisma, "$transaction"> = prisma) {
  return db.$transaction(async tx => {
    const assinatura = await tx.subscription.create({ data: {
      organizationId: params.organizationId, description: params.descricao,
      amount: new Prisma.Decimal(params.valorCents).div(100), currency: "BRL",
      billingDay: params.dia, billingCycle: params.ciclo, startedAt: params.inicio,
      status: "ACTIVE", productKey: params.produto, productTenantId: params.tenant,
    } });
    // O operador informou os IDs; aliases desconhecidos continuam pendentes.
    const produto = params.produto && params.tenant && ["LOJA", "MAIL", "COMANDEIRO", "SITE"].includes(params.produto)
      ? await tx.coreProduct.upsert({
          where: { productKey_tenantId_environment: {
            productKey: params.produto, tenantId: params.tenant, environment: "production",
          } }, update: {}, create: {
            organizationId: params.organizationId, productKey: params.produto, tenantId: params.tenant,
            environment: "production", source: "OPERATOR_SUBSCRIPTION",
          },
        }) : null;
    const contrato = await tx.coreContract.create({ data: {
      organizationId: params.organizationId, legacySubscriptionId: assinatura.id, productId: produto?.id,
      description: assinatura.description, amount: assinatura.amount, currency: assinatura.currency,
      billingCycle: assinatura.billingCycle, billingDay: assinatura.billingDay, status: assinatura.status,
      startsAt: assinatura.startedAt, source: "OPERATOR_SUBSCRIPTION",
    } });
    if (!produto) await tx.coreReconciliationIssue.create({ data: {
      entityType: "subscriptions", entityId: assinatura.id, code: "PRODUCT_UNRESOLVED",
    } });
    const competencia = params.inicio.toISOString().slice(0, 7);
    const agora = new Date();
    const emSeteDias = new Date(agora.getTime() + 7 * 86_400_000);
    const vencimento = new Date(Date.UTC(params.inicio.getUTCFullYear(), params.inicio.getUTCMonth(), params.dia));
    const recorrente = await tx.subscriptionInvoice.create({ data: {
      subscriptionId: assinatura.id, competence: competencia, kind: params.ciclo, amount: assinatura.amount,
      dueDate: vencimento < agora ? emSeteDias : vencimento,
    } });
    const setup = params.implantacaoCents ? await tx.subscriptionInvoice.create({ data: {
      subscriptionId: assinatura.id, competence: competencia, kind: "SETUP",
      amount: new Prisma.Decimal(params.implantacaoCents).div(100), dueDate: emSeteDias,
    } }) : null;
    await tx.operationsAuditEvent.create({ data: {
      action: "SUBSCRIPTION_CREATED", entityType: "Subscription", entityId: assinatura.id,
      organizationId: params.organizationId, actorId: params.actorId,
      metadata: { contratoId: contrato.id, ciclo: params.ciclo, moeda: assinatura.currency,
        valorCents: params.valorCents, faturaRecorrente: recorrente.id, faturaSetup: setup?.id ?? null },
    } });
    await agendarEvento(tx, "subscription.created", `subscription.created:${assinatura.id}`, {
      organizationId: params.organizationId, subscriptionId: assinatura.id, contractId: contrato.id,
    });
    return { assinatura, faturas: [recorrente, ...(setup ? [setup] : [])] };
  });
}
