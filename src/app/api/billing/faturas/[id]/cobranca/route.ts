import { NextRequest, NextResponse } from "next/server";
import {
  CobrancaIndisponivelError,
  criarCobrancaDaFatura,
  type MetodoCobranca,
} from "@/lib/assinaturas";
import { verifyServiceJwt } from "@/lib/service-auth";

const METODOS: MetodoCobranca[] = ["PIX", "BOLETO", "CARD"];

/**
 * Emite uma cobrança para a fatura (PIX, boleto ou cartão).
 *
 * O valor NUNCA vem do pedido — sai da fatura, e o acréscimo do cartão é
 * recalculado aqui. Aceitar valor do cliente numa rota de cobrança é o
 * caminho mais curto para alguém pagar R$ 1,00 numa mensalidade de R$ 299.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!verifyServiceJwt(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));

  const metodo = String(body?.metodo ?? "").toUpperCase() as MetodoCobranca;
  if (!METODOS.includes(metodo)) {
    return NextResponse.json({ error: "Método inválido." }, { status: 400 });
  }

  const parcelas = Number(body?.parcelas ?? 1);
  if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > 12) {
    return NextResponse.json({ error: "Parcelas inválidas." }, { status: 400 });
  }

  try {
    const cobranca = await criarCobrancaDaFatura({
      invoiceId: id,
      metodo,
      parcelas,
      paymentToken: typeof body?.paymentToken === "string" ? body.paymentToken : undefined,
    });

    return NextResponse.json({
      cobranca: {
        metodo: cobranca.method,
        status: cobranca.status,
        valorCents: Math.round(Number(cobranca.amount.toString()) * 100),
        parcelas: cobranca.installments,
        jurosCents: Math.round(Number(cobranca.interestAmount.toString()) * 100),
        pixCopiaECola: cobranca.pixCopyPaste,
        pixQrBase64: cobranca.pixQrBase64,
        boletoUrl: cobranca.boletoUrl,
        boletoLinhaDigitavel: cobranca.boletoBarcode,
        expiraEm: cobranca.expiresAt?.toISOString() ?? null,
      },
    });
  } catch (erro) {
    // Falta de dado do cliente e recusa da Efí são 400 com a mensagem que o
    // produto pode mostrar. Só o inesperado vira 500.
    if (erro instanceof CobrancaIndisponivelError) {
      return NextResponse.json({ error: erro.message }, { status: 400 });
    }

    const mensagem = erro instanceof Error ? erro.message : String(erro);
    return NextResponse.json({ error: mensagem }, { status: 502 });
  }
}
