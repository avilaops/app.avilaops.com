import { NextRequest, NextResponse } from "next/server";
import { getSessaoPortal, ehDaCasa } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { participaDaEmpresa } from "@/lib/nucleo/acesso";
import { criarCobrancaDaFatura, CobrancaIndisponivelError } from "@/lib/assinaturas";

export const runtime = "nodejs";

/**
 * O cliente gera a própria cobrança da fatura em aberto.
 *
 * Antes disso, quem quisesse pagar precisava pedir o Pix por WhatsApp e
 * esperar alguém da casa abrir o painel. Fatura que o cliente não consegue
 * pagar sozinho é atrito nosso, não dele.
 *
 * A fatura é buscada **pela organização da sessão**, nunca pelo id da URL
 * sozinho: é o que impede um cliente de gerar cobrança da fatura de outro
 * trocando o id no endereço.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await getSessaoPortal();
  if (!sessao) {
    return NextResponse.json({ erro: "Faça login para continuar." }, { status: 401 });
  }
  if (ehDaCasa(sessao.role)) {
    return NextResponse.json({ erro: "Use a ficha do cliente para cobrar." }, { status: 403 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ erro: "Origem não autorizada." }, { status: 403 });
  }
  if (!sessao.organizationId) {
    return NextResponse.json({ erro: "Sua conta ainda não está ligada a uma empresa." }, { status: 409 });
  }

  const { id } = await params;
  if (!(await participaDaEmpresa(sessao.id, sessao.organizationId))) {
    return NextResponse.json({ erro: "Sem acesso a esta empresa." }, { status: 403 });
  }
  const corpo = (await request.json().catch(() => null)) as { metodo?: unknown } | null;
  const metodo = corpo?.metodo === "BOLETO" ? "BOLETO" : corpo?.metodo === "PAYPAL" ? "PAYPAL" : "PIX";

  const fatura = await prisma.subscriptionInvoice.findFirst({
    where: { id, subscription: { organizationId: sessao.organizationId } },
    select: { id: true, status: true },
  });
  if (!fatura) {
    return NextResponse.json({ erro: "Fatura não encontrada." }, { status: 404 });
  }
  if (fatura.status === "PAID") {
    return NextResponse.json({ erro: "Esta fatura já está paga." }, { status: 409 });
  }
  if (fatura.status === "CANCELLED") {
    return NextResponse.json({ erro: "Esta fatura foi cancelada." }, { status: 409 });
  }
  const [recebivel] = await prisma.$queryRaw<{ outstanding: unknown; amount: unknown }[]>`
    SELECT outstanding,amount FROM core.receivables
    WHERE source='INVOICE' AND source_id=${fatura.id} AND organization_id=${sessao.organizationId}`;
  if (!recebivel || Number(recebivel.outstanding) !== Number(recebivel.amount)) {
    return NextResponse.json({ erro: "Esta fatura possui pagamento registrado. Fale com o atendimento para conciliar o saldo." }, { status: 409 });
  }

  try {
    const cobranca = await criarCobrancaDaFatura({ invoiceId: fatura.id, metodo });
    await prisma.operationsAuditEvent.create({
      data: {
        action: "SUBSCRIPTION_CHARGE_CREATED",
        entityType: "SubscriptionInvoice",
        entityId: fatura.id,
        organizationId: sessao.organizationId,
        actorId: sessao.id,
        metadata: { metodo, porOnde: "portal do cliente" },
      },
    });

    return NextResponse.json({
      ok: true,
      metodo: cobranca.method,
      pixCopiaECola: cobranca.pixCopyPaste,
      pixQrBase64: cobranca.pixQrBase64,
      boletoUrl: cobranca.boletoUrl,
      checkoutUrl: cobranca.checkoutUrl,
      expiraEm: cobranca.expiresAt?.toISOString() ?? null,
    });
  } catch (erro) {
    if (erro instanceof CobrancaIndisponivelError) {
      return NextResponse.json({ erro: erro.message }, { status: 400 });
    }
    console.error("[portal] não gerou a cobrança da fatura", fatura.id, erro);
    return NextResponse.json(
      { erro: "Não consegui gerar a cobrança agora. Tente de novo em instantes ou fale com a gente." },
      { status: 502 },
    );
  }
}
