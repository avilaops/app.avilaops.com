import { NextRequest, NextResponse } from "next/server";
import { processarReguaDeCobranca } from "@/lib/regua-cobranca-email";
import { isServiceCall } from "@/lib/service-auth";

export const runtime = "nodejs";

/** Relógio interno da régua • o n8n chama; regra, fila e auditoria ficam no app. */
export async function POST(request: NextRequest) {
  if (!isServiceCall(request)) {
    return NextResponse.json({ ok: false, erro: "Não autorizado." }, { status: 401 });
  }

  try {
    const resumo = await processarReguaDeCobranca();
    return NextResponse.json({ ok: true, ...resumo });
  } catch (erro) {
    console.error("[cobranca-regua] processamento falhou", erro);
    return NextResponse.json({ ok: false, erro: "Não foi possível processar a régua de cobrança." }, { status: 500 });
  }
}
