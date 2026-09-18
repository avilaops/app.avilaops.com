import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { obterCredencial } from "@/lib/credenciais";
import {
  META_PROVIDER,
  processMetaWebhookPayload,
  verifyMetaWebhookToken,
} from "@/lib/meta";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function verifySignature(rawBody: string, signature: string | null) {
  const appSecret = await obterCredencial("META_APP_SECRET");
  if (!signature || !appSecret) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");

  // timingSafeEqual estoura quando os buffers têm tamanhos diferentes, e
  // assinatura malformada é justamente o caso comum de quem sonda o endpoint:
  // sem esta guarda, a rota respondia 500 em vez de 403.
  const recebida = Buffer.from(signature);
  const esperada = Buffer.from(expected);
  if (recebida.length !== esperada.length) return false;

  return crypto.timingSafeEqual(recebida, esperada);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && challenge && (await verifyMetaWebhookToken(token))) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json({ error: "Webhook Meta não autorizado." }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!(await verifySignature(rawBody, signature))) {
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const objectType =
    payload && typeof payload === "object" && "object" in payload
      ? String(payload.object)
      : "unknown";

  const entries =
    payload && typeof payload === "object" && "entry" in payload && Array.isArray(payload.entry)
      ? payload.entry
      : [payload];

  await prisma.$transaction(
    entries.map((entry, index) => {
      const entryObject = entry && typeof entry === "object" ? entry : {};
      const externalId =
        "id" in entryObject && entryObject.id ? String(entryObject.id) : null;
      const time =
        "time" in entryObject && entryObject.time ? String(entryObject.time) : "no-time";

      return prisma.integrationWebhookEvent.create({
        data: {
          provider: META_PROVIDER,
          eventType: objectType,
          externalId,
          idempotencyKey: `${META_PROVIDER}:${objectType}:${externalId ?? "entry"}:${time}:${index}`,
          payload: entry as object,
        },
      });
    }),
  );

  const importedLeads =
    objectType === "page"
      ? await processMetaWebhookPayload(payload as Parameters<typeof processMetaWebhookPayload>[0])
      : [];

  return NextResponse.json({ ok: true, importedLeads: importedLeads.length });
}
