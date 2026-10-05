import { NextRequest } from "next/server";
import { responderEnvio } from "@/lib/entrega-cobranca-http";

export const runtime = "nodejs";

/** Envia ao cliente uma cobrança já emitida. Regras em `responderEnvio`. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return responderEnvio(request, { tipo: "cobranca", id });
}
