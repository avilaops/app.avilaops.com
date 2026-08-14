import { NextRequest, NextResponse } from "next/server";
import {
  type EncryptedFlowRequest,
  processWhatsappFlowPayload,
} from "@/lib/whatsapp";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  try {
    const encrypted = await processWhatsappFlowPayload(payload as EncryptedFlowRequest);
    return new NextResponse(encrypted, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao processar WhatsApp Flow.";
    return NextResponse.json({ error: message }, { status: 421 });
  }
}
