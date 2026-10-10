import { NextRequest, NextResponse } from "next/server";
import { BaixaRecusadaError, registrarPagamentoDireto } from "@/lib/assinaturas";
import { ehDono, getAdmin } from "@/lib/auth";
import { cleanText, sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { isServiceCall } from "@/lib/service-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Baixa de fatura paga por fora: `{ pagoEm, comprovante }`.
 *
 * Para o Pix que o cliente manda direto na chave da casa, que nenhum webhook
 * confirma. Quem lança é o dono, pela ficha do cliente, ou uma automação com
 * `x-service-key` (o mesmo par de portas de `/api/billing/faturamento/run`).
 *
 * `pagoEm` é a data do comprovante: `AAAA-MM-DD` ou um instante ISO completo.
 * Data pura vira meio-dia em São Paulo, para o pagamento cair no dia certo em
 * qualquer fuso que o leia depois. `comprovante` é o ID da transação do Pix.
 */
function lerPagoEm(valor: string): Date | null {
  const texto = /^\d{4}-\d{2}-\d{2}$/.test(valor) ? `${valor}T12:00:00-03:00` : valor;
  const data = new Date(texto);
  if (Number.isNaN(data.getTime())) return null;
  // Comprovante do futuro é erro de digitação; um dia de folga cobre o fuso.
  if (data.getTime() > Date.now() + 24 * 60 * 60 * 1000) return null;
  return data;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let actorId: string | null = null;
  if (!isServiceCall(request)) {
    const admin = await getAdmin();
    if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    // Dinheiro, segredo e acesso são do dono; a equipe para aqui.
    if (!ehDono(admin.role)) return NextResponse.json({ error: "Só o dono da conta pode isto." }, { status: 403 });
    if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
    actorId = admin.id;
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const comprovante = cleanText(body?.comprovante, 64);
  const pagoEm = lerPagoEm(cleanText(body?.pagoEm, 40));
  if (!pagoEm) {
    return NextResponse.json({ error: "Informe a data do pagamento (AAAA-MM-DD), que não pode ser futura." }, { status: 400 });
  }

  try {
    const cobranca = await registrarPagamentoDireto({ invoiceId: id, pagoEm, comprovante });
    if (!cobranca) return NextResponse.json({ error: "A baixa não foi registrada." }, { status: 500 });

    await prisma.operationsAuditEvent.create({
      data: {
        organizationId: cobranca.invoice.subscription.organizationId,
        action: "FATURA_BAIXADA_POR_FORA",
        entityType: "SubscriptionInvoice",
        entityId: id,
        actorId,
        metadata: {
          comprovante: cobranca.externalId,
          pagoEm: pagoEm.toISOString(),
          valor: cobranca.amount.toString(),
          origem: actorId ? "painel" : "servico",
        },
      },
    });
    return NextResponse.json({ ok: true, faturaId: id, pagoEm: pagoEm.toISOString() });
  } catch (erro) {
    if (erro instanceof BaixaRecusadaError) {
      return NextResponse.json({ error: erro.message }, { status: 400 });
    }
    console.error("[baixa] não registrei o pagamento direto", erro);
    return NextResponse.json({ error: "Não foi possível registrar o pagamento." }, { status: 500 });
  }
}
