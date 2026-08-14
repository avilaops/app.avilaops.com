import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { AiCoreStructuredClient, StructuredOutputValidationError } from "../structured";
import { RecordingTelemetrySink, StaticKeyProvider, fakeResponseBody } from "./test-helpers";
import type { TenantContext } from "../types";

const tenant: TenantContext = {
  organizationId: "org_1",
  projectId: "proj_1",
  agentId: "agent_comercial",
};

const leadSchema = z.object({
  qualified: z.boolean(),
  score: z.number(),
  reason: z.string(),
});

function fakeStructuredFetch(json: unknown) {
  return async function fetchImpl(): Promise<Response> {
    const body = fakeResponseBody(JSON.stringify(json), { input_tokens: 15, output_tokens: 25 });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

test("structured complete: saída válida é parseada e tipada corretamente", async () => {
  const telemetry = new RecordingTelemetrySink();
  const client = new AiCoreStructuredClient({
    keyProvider: new StaticKeyProvider(),
    telemetrySink: telemetry,
    fetch: fakeStructuredFetch({ qualified: true, score: 8, reason: "Orçamento definido" }),
  });

  const result = await client.complete({
    tenant,
    model: "gpt-4o-mini",
    input: "Lead: quer contratar site institucional, orçamento de R$5000",
    schema: leadSchema,
    schemaName: "lead_qualification",
  });

  assert.equal(result.data.qualified, true);
  assert.equal(result.data.score, 8);
  assert.equal(telemetry.events[0].outcome, "SUCCESS");
});

test("structured complete: saída fora do schema lança StructuredOutputValidationError e registra telemetria ERROR", async () => {
  const telemetry = new RecordingTelemetrySink();
  const client = new AiCoreStructuredClient({
    keyProvider: new StaticKeyProvider(),
    telemetrySink: telemetry,
    fetch: fakeStructuredFetch({ qualified: "sim", score: "alto" }),
  });

  await assert.rejects(
    () =>
      client.complete({
        tenant,
        model: "gpt-4o-mini",
        input: "teste",
        schema: leadSchema,
        schemaName: "lead_qualification",
      }),
    StructuredOutputValidationError,
  );
  assert.equal(telemetry.events[0].outcome, "ERROR");
});

test("structured complete: JSON malformado é tratado como erro de validação, não exceção crua", async () => {
  const telemetry = new RecordingTelemetrySink();
  const brokenFetch = async () =>
    new Response(
      JSON.stringify(fakeResponseBody("isto não é json", { input_tokens: 1, output_tokens: 1 })),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  const client = new AiCoreStructuredClient({
    keyProvider: new StaticKeyProvider(),
    telemetrySink: telemetry,
    fetch: brokenFetch,
  });

  await assert.rejects(
    () =>
      client.complete({
        tenant,
        model: "gpt-4o-mini",
        input: "teste",
        schema: leadSchema,
        schemaName: "lead_qualification",
      }),
    StructuredOutputValidationError,
  );
});
