import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const database = vi.hoisted(() => ({ create: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationWebhookEvent: { create: database.create },
    $transaction: database.transaction,
  },
}));

import { POST } from "@/app/api/webhooks/whatsapp/route";
import { isWhatsappConfigured } from "@/lib/whatsapp";

const secret = "test-whatsapp-secret";
const body = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{ id: "test-account", time: 123, changes: [] }],
});

function sign(payload: string, key = secret) {
  return `sha256=${crypto.createHmac("sha256", key).update(payload).digest("hex")}`;
}

function request(payload: string, signature?: string) {
  return new NextRequest("https://app.avilaops.com/api/webhooks/whatsapp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(signature === undefined ? {} : { "x-hub-signature-256": signature }),
    },
    body: payload,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WHATSAPP_APP_SECRET", secret);
  database.create.mockResolvedValue({ id: "event" });
  database.transaction.mockResolvedValue([]);
});

afterEach(() => vi.unstubAllEnvs());

describe("WhatsApp webhook authentication", () => {
  it("does not report ready without the key needed to authenticate incoming events", () => {
    vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "test-verify-token");
    vi.stubEnv("WHATSAPP_API_TOKEN", "test-api-token");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "test-phone");
    expect(isWhatsappConfigured()).toBe(true);
    vi.stubEnv("WHATSAPP_APP_SECRET", "");
    expect(isWhatsappConfigured()).toBe(false);
  });

  it("refuses events when the signing secret is not configured", async () => {
    vi.stubEnv("WHATSAPP_APP_SECRET", "");
    const response = await POST(request(body, sign(body)));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Assinatura inválida." });
    expect(database.create).not.toHaveBeenCalled();
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    "",
    "sha256=short",
    `sha256=${"g".repeat(64)}`,
    `sha1=${"a".repeat(64)}`,
    `sha256=${"a".repeat(66)}`,
    sign(body, "wrong-secret"),
  ])("rejects missing, malformed or invalid signature %s without writing", async (signature) => {
    const response = await POST(request(body, signature));
    expect(response.status).toBe(403);
    expect(database.create).not.toHaveBeenCalled();
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it("rejects a payload changed after signing", async () => {
    const response = await POST(request(body.replace("test-account", "another-account"), sign(body)));
    expect(response.status).toBe(403);
    expect(database.create).not.toHaveBeenCalled();
  });

  it("persists an event only after verifying its exact request body", async () => {
    const response = await POST(request(body, sign(body)));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, objectType: "whatsapp_business_account", entries: 1 });
    expect(database.create).toHaveBeenCalledOnce();
    expect(database.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      provider: "whatsapp_business",
      externalId: "test-account",
      payload: { id: "test-account", time: 123, changes: [] },
    }) });
    expect(database.transaction).toHaveBeenCalledOnce();
  });

  it("rejects invalid JSON even with a valid signature without writing", async () => {
    const response = await POST(request("{", sign("{")));
    expect(response.status).toBe(400);
    expect(database.create).not.toHaveBeenCalled();
    expect(database.transaction).not.toHaveBeenCalled();
  });
});
