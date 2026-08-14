import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { AiCoreClient, KillSwitchRegistry } from "@avila-ops/ai-core";
import type { KeyProvider } from "@avila-ops/ai-core";
import { PrismaTelemetrySink } from "../telemetry-sink";
import { setupTestTenants } from "./test-setup";

class StaticKeyProvider implements KeyProvider {
  async getApiKey(): Promise<string> {
    return "sk-test-key";
  }
}

function fakeFetch(outputText: string) {
  return async (): Promise<Response> => {
    const body = {
      id: "resp_test",
      object: "response",
      status: "completed",
      output: [
        {
          type: "message",
          id: "msg_test",
          status: "completed",
          role: "assistant",
          content: [{ type: "output_text", text: outputText, annotations: [] }],
        },
      ],
      usage: {
        input_tokens: 12,
        output_tokens: 8,
        total_tokens: 20,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
      },
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

test("PrismaTelemetrySink: chamada real do AiCoreClient persiste um registro consultável no banco", async () => {
  const { orgA, cleanup } = await setupTestTenants();
  try {
    const client = new AiCoreClient({
      keyProvider: new StaticKeyProvider(),
      telemetrySink: new PrismaTelemetrySink(),
      fetch: fakeFetch("Resposta de teste"),
    });

    const tenant = { organizationId: orgA.id, projectId: "proj_1", agentId: "agent_teste" };
    const result = await client.complete({ tenant, model: "gpt-4o-mini", input: "Oi" });

    const record = await prisma.aiCoreTelemetry.findUnique({
      where: { requestId: result.requestId },
    });

    assert.ok(record, "registro de telemetria deve existir no banco");
    assert.equal(record?.organizationId, orgA.id);
    assert.equal(record?.outcome, "SUCCESS");
    assert.equal(record?.inputTokens, 12);
    assert.equal(record?.outputTokens, 8);
  } finally {
    await cleanup();
  }
});

test("KillSwitchRegistry integrado ao AiCoreClient: agente bloqueado não gera nenhum registro de telemetria", async () => {
  const { orgA, cleanup } = await setupTestTenants();
  try {
    const killSwitch = new KillSwitchRegistry();
    killSwitch.blockAgent("agent_bloqueado");

    const client = new AiCoreClient({
      keyProvider: new StaticKeyProvider(),
      telemetrySink: new PrismaTelemetrySink(),
      killSwitch,
      fetch: fakeFetch("não deveria chegar aqui"),
    });

    const tenant = { organizationId: orgA.id, projectId: "proj_1", agentId: "agent_bloqueado" };

    await assert.rejects(() =>
      client.complete({ tenant, model: "gpt-4o-mini", input: "Oi" }),
    );

    const count = await prisma.aiCoreTelemetry.count({
      where: { organizationId: orgA.id, agentId: "agent_bloqueado" },
    });
    assert.equal(count, 0, "kill switch deve impedir a chamada antes de qualquer efeito, incluindo telemetria");
  } finally {
    await cleanup();
  }
});
