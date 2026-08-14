import { NextRequest, NextResponse } from "next/server";
import {
  registerWhatsappWebhookPayload,
  verifyWhatsappWebhookToken,
} from "@/lib/whatsapp";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && challenge && verifyWhatsappWebhookToken(token)) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json({ error: "Webhook WhatsApp não autorizado." }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  let result: Awaited<ReturnType<typeof registerWhatsappWebhookPayload>>;
  try {
    result = await registerWhatsappWebhookPayload(rawBody, signature);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao processar webhook.";
    const status = message === "Assinatura inválida." ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ ok: true, ...result });
}
