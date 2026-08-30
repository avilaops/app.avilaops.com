import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  CobrancaIndisponivelError,
  criarCobrancaDaFatura,
  garantirFatura,
  type MetodoCobranca,
} from "@/lib/assinaturas";
import { getAdmin } from "@/lib/auth";
import { cleanText, sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const METODOS: MetodoCobranca[] = ["PIX", "BOLETO"];

/**
 * Ações sobre uma assinatura existente:
 * - `pausar` / `retomar` / `cancelar` (cancelar fecha `endedAt`);
 * - `ajustar` `{ valor?, dia? }` — vale a partir da próxima fatura;
 * - `gerar-fatura` `{ competencia? }` — mensalidade do mês (idempotente);
 * - `cobrar` `{ invoiceId, metodo: PIX | BOLETO }` — emite a cobrança na Éfi
 *   e devolve o copia-e-cola / link do boleto para mandar ao cliente.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string }> },
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  const { id, subId } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const acao = cleanText(body?.acao, 20);

  const assinatura = await prisma.subscription.findFirst({ where: { id: subId, organizationId: id } });
  if (!assinatura) return NextResponse.json({ error: "Assinatura não encontrada." }, { status: 404 });

  const auditar = (action: string, metadata: Prisma.InputJsonObject) =>
    prisma.operationsAuditEvent.create({
      data: { action, entityType: "Subscription", entityId: subId, organizationId: id, actorId: admin.id, metadata },
    });

  if (acao === "pausar" || acao === "retomar" || acao === "cancelar") {
    const status = acao === "pausar" ? "PAUSED" : acao === "retomar" ? "ACTIVE" : "CANCELLED";
    await prisma.subscription.update({
      where: { id: subId },
      data: { status, endedAt: status === "CANCELLED" ? new Date() : null },
    });
    if (status === "CANCELLED") {
      await prisma.subscriptionInvoice.updateMany({
        where: { subscriptionId: subId, status: { in: ["OPEN", "OVERDUE"] } },
        data: { status: "CANCELLED" },
      });
    }
    await auditar(`SUBSCRIPTION_${status}`, { de: assinatura.status });
    return NextResponse.json({ ok: true, status });
  }

  if (acao === "ajustar") {
    const valorTexto = cleanText(body?.valor, 30).replace(/\./g, "").replace(",", ".");
    const valor = valorTexto ? Number(valorTexto) : null;
    const diaTexto = cleanText(body?.dia, 3);
    const dia = diaTexto ? Number(diaTexto) : null;
    if (valor !== null && (!Number.isFinite(valor) || valor <= 0)) {
      return NextResponse.json({ error: "Valor inválido." }, { status: 400 });
    }
    if (dia !== null && (!Number.isInteger(dia) || dia < 1 || dia > 28)) {
      return NextResponse.json({ error: "Dia entre 1 e 28." }, { status: 400 });
    }
    await prisma.subscription.update({
      where: { id: subId },
      data: { ...(valor !== null ? { amount: valor } : {}), ...(dia !== null ? { billingDay: dia } : {}) },
    });
    await auditar("SUBSCRIPTION_ADJUSTED", { valorAntes: assinatura.amount.toString(), valor, diaAntes: assinatura.billingDay, dia });
    return NextResponse.json({ ok: true });
  }

  if (acao === "gerar-fatura") {
    if (assinatura.status !== "ACTIVE") {
      return NextResponse.json({ error: "A assinatura não está ativa." }, { status: 409 });
    }
    const agora = new Date();
    const competencia =
      /^\d{4}-\d{2}$/.test(cleanText(body?.competencia, 7))
        ? cleanText(body?.competencia, 7)
        : `${agora.getUTCFullYear()}-${String(agora.getUTCMonth() + 1).padStart(2, "0")}`;
    const fatura = await garantirFatura({ subscriptionId: subId, competencia, tipo: "MONTHLY" });
    await auditar("SUBSCRIPTION_INVOICE_ENSURED", { competencia, faturaId: fatura?.id ?? null });
    return NextResponse.json({ ok: true, faturaId: fatura?.id ?? null, competencia });
  }

  if (acao === "cobrar") {
    const invoiceId = cleanText(body?.invoiceId, 64);
    const metodo = cleanText(body?.metodo, 10).toUpperCase() as MetodoCobranca;
    if (!invoiceId || !METODOS.includes(metodo)) {
      return NextResponse.json({ error: "Informe a fatura e o método (PIX ou BOLETO)." }, { status: 400 });
    }
    const fatura = await prisma.subscriptionInvoice.findFirst({ where: { id: invoiceId, subscriptionId: subId }, select: { id: true } });
    if (!fatura) return NextResponse.json({ error: "Fatura não encontrada nesta assinatura." }, { status: 404 });

    try {
      const cobranca = await criarCobrancaDaFatura({ invoiceId, metodo });
      await auditar("SUBSCRIPTION_CHARGE_CREATED", { invoiceId, metodo, externalId: cobranca.externalId });
      return NextResponse.json({
        ok: true,
        cobranca: {
          metodo: cobranca.method,
          status: cobranca.status,
          valorCents: Math.round(Number(cobranca.amount.toString()) * 100),
          pixCopiaECola: cobranca.pixCopyPaste,
          pixQrBase64: cobranca.pixQrBase64,
          boletoUrl: cobranca.boletoUrl,
          boletoLinhaDigitavel: cobranca.boletoBarcode,
          expiraEm: cobranca.expiresAt?.toISOString() ?? null,
        },
      });
    } catch (erro) {
      if (erro instanceof CobrancaIndisponivelError) {
        return NextResponse.json({ error: erro.message }, { status: 400 });
      }
      return NextResponse.json({ error: erro instanceof Error ? erro.message : "A Éfi recusou a cobrança." }, { status: 502 });
    }
  }

  return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
}
