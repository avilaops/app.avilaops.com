import { NextRequest } from "next/server";
import { responderEnvio } from "@/lib/entrega-cobranca-http";

export const runtime = "nodejs";

/**
 * Envia ao cliente a partir da FATURA: serve para mandar o resumo antes de
 * existir PIX, boleto ou PayPal. Com cobrança ativa, também manda o link da
 * mais recente. Regras em `responderEnvio`.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return responderEnvio(request, { tipo: "fatura", id });
}
