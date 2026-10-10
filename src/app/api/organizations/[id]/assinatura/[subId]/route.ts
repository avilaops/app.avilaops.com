import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  CobrancaIndisponivelError,
  competenciaSeguinte,
  criarCobrancaDaFatura,
  garantirFatura,
  recorrenteDe,
  type MetodoCobranca,
} from "@/lib/assinaturas";
import { ehDono, getAdmin } from "@/lib/auth";
import { cleanText, sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";

// PAYPAL é o trilho de quem paga de fora do Brasil; a regra de país mora em
// criarCobrancaDaFatura, que recusa o método errado com mensagem clara.
const METODOS: MetodoCobranca[] = ["PIX", "BOLETO", "PAYPAL"];

/**
 * Ações sobre uma assinatura existente:
 * - `pausar` / `retomar` / `cancelar` (cancelar fecha `endedAt`);
 * - `ajustar` `{ valor?, dia?, comissao? }` — vale a partir da próxima fatura;
 *   `comissao` é o percentual sobre as vendas (0 tira);
 * - `gerar-fatura` `{ competencia? }` — mensalidade do mês (idempotente);
 * - `implantacao` `{ valor, vencimento }` — fatura de implantação numa
 *   assinatura que já existe; a competência é a do vencimento;
 * - `cancelar-fatura` `{ invoiceId }` — só fatura em aberto;
 * - `cobrar` `{ invoiceId, metodo: PIX | BOLETO | PAYPAL }` — emite a cobrança no
 *   Mercado Pago, único meio da casa desde 31/08/2026
 *   e devolve o copia-e-cola / link do boleto para mandar ao cliente.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string }> },
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  // Dinheiro, segredo e acesso são do dono; a equipe para aqui.
  if (!ehDono(admin.role)) return NextResponse.json({ error: "Só o dono da conta pode isto." }, { status: 403 });
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
    // Comissão sobre as vendas: campo ausente não mexe, "0" tira a comissão.
    const comissaoTexto = cleanText(body?.comissao, 10).replace(",", ".");
    const comissao = comissaoTexto ? Number(comissaoTexto) : null;
    if (comissao !== null && (!Number.isFinite(comissao) || comissao < 0 || comissao > 100)) {
      return NextResponse.json({ error: "Comissão entre 0 e 100%." }, { status: 400 });
    }
    await prisma.subscription.update({
      where: { id: subId },
      data: {
        ...(valor !== null ? { amount: valor } : {}),
        ...(dia !== null ? { billingDay: dia } : {}),
        ...(comissao !== null ? { salesCommissionPercent: comissao === 0 ? null : comissao } : {}),
      },
    });
    await auditar("SUBSCRIPTION_ADJUSTED", {
      valorAntes: assinatura.amount.toString(),
      valor,
      diaAntes: assinatura.billingDay,
      dia,
      comissaoAntes: assinatura.salesCommissionPercent?.toString() ?? null,
      comissao,
    });
    return NextResponse.json({ ok: true });
  }

  if (acao === "gerar-fatura") {
    if (assinatura.status !== "ACTIVE") {
      return NextResponse.json({ error: "A assinatura não está ativa." }, { status: 409 });
    }
    const agora = new Date();
    // No anual a competência do mês corrente quase nunca é a certa: a cobrança
    // cai no mês de aniversário. Sem competência informada, avança um ciclo a
    // partir da última fatura da recorrência — assim o botão não abre uma
    // segunda fatura anual no mesmo ano.
    const tipo = recorrenteDe(assinatura.billingCycle);
    const ultima = await prisma.subscriptionInvoice.findFirst({
      where: { subscriptionId: subId, kind: tipo },
      orderBy: { competence: "desc" },
      select: { competence: true },
    });
    const informada = cleanText(body?.competencia, 7);
    const competencia = /^\d{4}-\d{2}$/.test(informada)
      ? informada
      : ultima
        ? competenciaSeguinte(ultima.competence, assinatura.billingCycle)
        : `${agora.getUTCFullYear()}-${String(agora.getUTCMonth() + 1).padStart(2, "0")}`;
    const fatura = await garantirFatura({ subscriptionId: subId, competencia, tipo });
    await auditar("SUBSCRIPTION_INVOICE_ENSURED", { competencia, faturaId: fatura?.id ?? null });
    return NextResponse.json({ ok: true, faturaId: fatura?.id ?? null, competencia });
  }

  if (acao === "implantacao") {
    const valorTexto = cleanText(body?.valor, 30).replace(/\./g, "").replace(",", ".");
    const valor = Number(valorTexto);
    if (!valorTexto || !Number.isFinite(valor) || valor <= 0) {
      return NextResponse.json({ error: "Informe o valor da implantação." }, { status: 400 });
    }
    // A competência sai do vencimento: implantação combinada meses atrás e
    // lançada só agora precisa cair no mês em que foi cobrada, não no de hoje.
    const vencimentoTexto = cleanText(body?.vencimento, 10);
    const vencimento = /^\d{4}-\d{2}-\d{2}$/.test(vencimentoTexto) ? new Date(`${vencimentoTexto}T00:00:00Z`) : null;
    if (!vencimento || Number.isNaN(vencimento.getTime())) {
      return NextResponse.json({ error: "Informe o vencimento (AAAA-MM-DD)." }, { status: 400 });
    }
    if (assinatura.status !== "ACTIVE") {
      return NextResponse.json({ error: "A assinatura não está ativa." }, { status: 409 });
    }
    const competencia = vencimentoTexto.slice(0, 7);
    // `garantirFatura` devolveria a que já existe, com o valor antigo, e a
    // tela diria "criada" sobre uma fatura que não é a que a pessoa pediu.
    const existente = await prisma.subscriptionInvoice.findUnique({
      where: { subscriptionId_competence_kind: { subscriptionId: subId, competence: competencia, kind: "SETUP" } },
      select: { id: true },
    });
    if (existente) {
      return NextResponse.json({ error: `Esta assinatura já tem implantação em ${competencia}.` }, { status: 409 });
    }
    const fatura = await garantirFatura({
      subscriptionId: subId, competencia, tipo: "SETUP", valorCents: Math.round(valor * 100), vencimento,
    });
    await auditar("SUBSCRIPTION_SETUP_INVOICE_CREATED", { competencia, valor, vencimento: vencimentoTexto, faturaId: fatura?.id ?? null });
    return NextResponse.json({ ok: true, faturaId: fatura?.id ?? null, competencia });
  }

  if (acao === "cancelar-fatura") {
    const invoiceId = cleanText(body?.invoiceId, 64);
    if (!invoiceId) return NextResponse.json({ error: "Informe a fatura." }, { status: 400 });
    const fatura = await prisma.subscriptionInvoice.findFirst({
      where: { id: invoiceId, subscriptionId: subId },
      select: { id: true, status: true, competence: true, kind: true, amount: true },
    });
    if (!fatura) return NextResponse.json({ error: "Fatura não encontrada nesta assinatura." }, { status: 404 });
    // O status entra na condição: fatura paga entre a leitura e aqui não é
    // cancelada. Cobrança já emitida segue valendo no gateway — se o cliente
    // pagar depois, a baixa reabre e quita a fatura, porque o dinheiro entrou.
    const { count } = await prisma.subscriptionInvoice.updateMany({
      where: { id: invoiceId, status: { in: ["OPEN", "OVERDUE"] } },
      data: { status: "CANCELLED" },
    });
    if (count !== 1) {
      return NextResponse.json({ error: "Só fatura em aberto pode ser cancelada." }, { status: 409 });
    }
    await auditar("SUBSCRIPTION_INVOICE_CANCELLED", {
      invoiceId, competencia: fatura.competence, tipo: fatura.kind, valor: fatura.amount.toString(), de: fatura.status,
    });
    return NextResponse.json({ ok: true });
  }

  if (acao === "cobrar") {
    const invoiceId = cleanText(body?.invoiceId, 64);
    const metodo = cleanText(body?.metodo, 10).toUpperCase() as MetodoCobranca;
    if (!invoiceId || !METODOS.includes(metodo)) {
      return NextResponse.json({ error: "Informe a fatura e o método (PIX, BOLETO ou PAYPAL)." }, { status: 400 });
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
          checkoutUrl: cobranca.checkoutUrl,
          expiraEm: cobranca.expiresAt?.toISOString() ?? null,
        },
      });
    } catch (erro) {
      if (erro instanceof CobrancaIndisponivelError) {
        return NextResponse.json({ error: erro.message }, { status: 400 });
      }
      return NextResponse.json({ error: erro instanceof Error ? erro.message : "O gateway recusou a cobrança." }, { status: 502 });
    }
  }

  return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
}
