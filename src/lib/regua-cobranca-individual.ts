import { randomUUID } from "node:crypto";

import type { ConteudoEnvio } from "@/lib/entrega-cobranca";
import { prisma } from "@/lib/prisma";

const CONTEUDOS = new Set<ConteudoEnvio>(["fatura", "cobranca", "ambos"]);

export class ReguaIndividualErro extends Error {}

function validarData(data: Date, agora: Date) {
  if (!Number.isFinite(data.getTime()) || data <= agora) throw new ReguaIndividualErro("Agende o lembrete para uma data futura.");
}

function validarConteudo(conteudo: string): ConteudoEnvio {
  if (!CONTEUDOS.has(conteudo as ConteudoEnvio)) throw new ReguaIndividualErro("Conteúdo do lembrete inválido.");
  return conteudo as ConteudoEnvio;
}

export async function criarLembreteIndividual(params: { invoiceId: string; scheduledFor: Date; content: string; actorId: string }, agora = new Date()) {
  validarData(params.scheduledFor, agora);
  const content = validarConteudo(params.content);
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.subscriptionInvoice.findUnique({ where: { id: params.invoiceId }, select: { id: true, organizationId: true, status: true } });
    if (!invoice) throw new ReguaIndividualErro("Fatura não encontrada.");
    if (invoice.status !== "OPEN" && invoice.status !== "OVERDUE") throw new ReguaIndividualErro("Só é possível agendar lembrete para fatura em aberto.");
    const dispatch = await tx.billingEmailDispatch.create({ data: { invoiceId: invoice.id, stage: `CUSTOM:${randomUUID()}`, scheduledFor: params.scheduledFor, content } });
    await tx.operationsAuditEvent.create({ data: { actorId: params.actorId, organizationId: invoice.organizationId, action: "COBRANCA_LEMBRETE_CRIADO", entityType: "BillingEmailDispatch", entityId: dispatch.id, metadata: { invoiceId: invoice.id, scheduledFor: params.scheduledFor.toISOString(), content } } });
    return dispatch;
  });
}

export async function alterarLembreteIndividual(params: { invoiceId: string; dispatchId: string; scheduledFor?: Date; content?: string; restore?: boolean; actorId: string }, agora = new Date()) {
  if (params.scheduledFor) validarData(params.scheduledFor, agora);
  const content = params.content === undefined ? undefined : validarConteudo(params.content);
  return prisma.$transaction(async (tx) => {
    const current = await tx.billingEmailDispatch.findFirst({ where: { id: params.dispatchId, invoiceId: params.invoiceId, stage: { startsWith: "CUSTOM:" } }, include: { invoice: { select: { organizationId: true, status: true } } } });
    if (!current) throw new ReguaIndividualErro("Lembrete personalizado não encontrado.");
    const editable = current.status === "PENDING" || (params.restore && current.status === "CANCELLED");
    if (!editable) throw new ReguaIndividualErro("Lembrete em processamento ou concluído não pode ser alterado.");
    if (current.invoice.status !== "OPEN" && current.invoice.status !== "OVERDUE") throw new ReguaIndividualErro("A fatura não está em aberto.");
    const dispatch = await tx.billingEmailDispatch.update({ where: { id: current.id }, data: { scheduledFor: params.scheduledFor, content, status: params.restore ? "PENDING" : undefined, cancelledAt: params.restore ? null : undefined, lastError: params.restore ? null : undefined } });
    await tx.operationsAuditEvent.create({ data: { actorId: params.actorId, organizationId: current.invoice.organizationId, action: params.restore ? "COBRANCA_LEMBRETE_RESTAURADO" : "COBRANCA_LEMBRETE_ALTERADO", entityType: "BillingEmailDispatch", entityId: dispatch.id, metadata: { invoiceId: params.invoiceId, scheduledFor: dispatch.scheduledFor.toISOString(), content: dispatch.content } } });
    return dispatch;
  });
}

export async function cancelarLembreteIndividual(
  params: { invoiceId: string; dispatchId: string; actorId: string },
  agora = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.billingEmailDispatch.findFirst({
      where: {
        id: params.dispatchId,
        invoiceId: params.invoiceId,
        stage: { startsWith: "CUSTOM:" },
        status: "PENDING",
      },
      include: { invoice: { select: { organizationId: true } } },
    });
    if (!current) throw new ReguaIndividualErro("Lembrete personalizado não encontrado.");

    const dispatch = await tx.billingEmailDispatch.update({
      where: { id: current.id },
      data: { status: "CANCELLED", cancelledAt: agora },
    });
    await tx.operationsAuditEvent.create({
      data: {
        actorId: params.actorId,
        organizationId: current.invoice.organizationId,
        action: "COBRANCA_LEMBRETE_CANCELADO",
        entityType: "BillingEmailDispatch",
        entityId: dispatch.id,
        metadata: { invoiceId: params.invoiceId },
      },
    });
    return dispatch;
  });
}
