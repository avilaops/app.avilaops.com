import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const WHATSAPP_PROVIDER = "whatsapp_business";

export type EncryptedFlowRequest = {
  encrypted_aes_key?: string;
  encrypted_flow_data?: string;
  initial_vector?: string;
};

type FlowRequest = {
  action?: string;
  screen?: string;
  data?: Record<string, unknown>;
};

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function configuredPrivateKey() {
  const base64 = process.env.WHATSAPP_FLOW_PRIVATE_KEY_BASE64;
  if (base64) return Buffer.from(base64, "base64").toString("utf8");

  const pem = process.env.WHATSAPP_FLOW_PRIVATE_KEY;
  if (pem) return pem.replace(/\\n/g, "\n");

  return null;
}

function decryptFlowRequest(payload: EncryptedFlowRequest) {
  const privatePem = configuredPrivateKey();
  if (!privatePem) throw new Error("WHATSAPP_FLOW_PRIVATE_KEY_BASE64 não configurado.");
  if (!payload.encrypted_aes_key || !payload.encrypted_flow_data || !payload.initial_vector) {
    throw new Error("Payload do WhatsApp Flow incompleto.");
  }

  const aesKey = crypto.privateDecrypt(
    {
      key: privatePem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(payload.encrypted_aes_key, "base64"),
  );
  const iv = Buffer.from(payload.initial_vector, "base64");
  const encryptedFlowData = Buffer.from(payload.encrypted_flow_data, "base64");
  const authTag = encryptedFlowData.subarray(encryptedFlowData.length - 16);
  const encryptedBody = encryptedFlowData.subarray(0, encryptedFlowData.length - 16);
  const decipher = crypto.createDecipheriv("aes-128-gcm", aesKey, iv);

  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encryptedBody), decipher.final()]);

  return {
    body: JSON.parse(decrypted.toString("utf8")) as FlowRequest,
    aesKey,
    iv,
  };
}

function encryptFlowResponse(payload: unknown, aesKey: Buffer, iv: Buffer) {
  const flippedIv = Buffer.from(iv.map((byte) => byte ^ 0xff));
  const cipher = crypto.createCipheriv("aes-128-gcm", aesKey, flippedIv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([encrypted, tag]).toString("base64");
}

function flowResponseFor(request: FlowRequest) {
  const data = request.data ?? {};

  if (request.action === "ping") {
    return { data: { status: "active" } };
  }

  if (request.action === "INIT") {
    return { screen: "RESERVATION", data: { error_message: "" } };
  }

  if (request.action === "data_exchange" && data.trigger === "check_availability") {
    if (data.horario === "20:00") {
      return {
        screen: "RESERVATION",
        data: {
          error_message: "Esse horário (20:00) está lotado. Escolha outro horário.",
        },
      };
    }

    return {
      screen: "CONFIRMATION",
      data: {
        nome: data.nome,
        data: data.data,
        horario: data.horario,
        pessoas: data.pessoas,
      },
    };
  }

  return { screen: "RESERVATION", data: { error_message: "" } };
}

function verifySignature(rawBody: string, signature: string | null) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return true;
  if (!signature) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export function verifyWhatsappWebhookToken(token: string | null) {
  return Boolean(process.env.WHATSAPP_VERIFY_TOKEN) &&
    token === process.env.WHATSAPP_VERIFY_TOKEN;
}

export function isWhatsappConfigured() {
  return Boolean(
    process.env.WHATSAPP_VERIFY_TOKEN &&
      process.env.WHATSAPP_API_TOKEN &&
      process.env.WHATSAPP_PHONE_NUMBER_ID,
  );
}

export async function registerWhatsappWebhookPayload(rawBody: string, signature: string | null) {
  if (!verifySignature(rawBody, signature)) {
    throw new Error("Assinatura inválida.");
  }

  const payload = JSON.parse(rawBody) as Record<string, unknown>;
  const entries = Array.isArray(payload.entry) ? payload.entry : [payload];
  const objectType = typeof payload.object === "string" ? payload.object : "unknown";

  await prisma.$transaction(
    entries.map((entry, index) => {
      const entryObject = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      const externalId = entryObject.id ? String(entryObject.id) : null;
      const time = entryObject.time ? String(entryObject.time) : "no-time";

      return prisma.integrationWebhookEvent.create({
        data: {
          provider: WHATSAPP_PROVIDER,
          eventType: objectType,
          externalId,
          idempotencyKey: `${WHATSAPP_PROVIDER}:${objectType}:${externalId ?? "entry"}:${time}:${index}`,
          payload: jsonValue(entry),
        },
      });
    }),
  );

  return { objectType, entries: entries.length };
}

export async function processWhatsappFlowPayload(payload: EncryptedFlowRequest) {
  const decrypted = decryptFlowRequest(payload);
  const response = flowResponseFor(decrypted.body);

  await prisma.integrationWebhookEvent.create({
    data: {
      provider: WHATSAPP_PROVIDER,
      eventType: "flow",
      externalId:
        typeof decrypted.body.screen === "string" ? decrypted.body.screen : null,
      status: "PROCESSED",
      payload: jsonValue({
        action: decrypted.body.action,
        screen: decrypted.body.screen,
        data: decrypted.body.data,
      }),
      processedAt: new Date(),
    },
  });

  return encryptFlowResponse(response, decrypted.aesKey, decrypted.iv);
}

export async function getWhatsappStatus() {
  const [events, flowEvents, latestEvent, connections] = await Promise.all([
    prisma.integrationWebhookEvent.count({ where: { provider: WHATSAPP_PROVIDER } }),
    prisma.integrationWebhookEvent.count({
      where: { provider: WHATSAPP_PROVIDER, eventType: "flow" },
    }),
    prisma.integrationWebhookEvent.findFirst({
      where: { provider: WHATSAPP_PROVIDER },
      orderBy: { receivedAt: "desc" },
      select: {
        eventType: true,
        status: true,
        receivedAt: true,
        error: true,
      },
    }),
    prisma.organizationIntegrationConnection.count({
      where: { provider: WHATSAPP_PROVIDER, status: { not: "DISCONNECTED" } },
    }),
  ]);

  return {
    configured: isWhatsappConfigured(),
    flowConfigured: Boolean(configuredPrivateKey()),
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ? "configurado" : "pendente",
    catalogId: process.env.WHATSAPP_CATALOG_ID ? "configurado" : "pendente",
    connections,
    events,
    flowEvents,
    latestEvent: latestEvent
      ? {
          ...latestEvent,
          receivedAt: latestEvent.receivedAt.toISOString(),
        }
      : null,
  };
}
