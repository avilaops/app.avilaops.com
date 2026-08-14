import { test } from "node:test";
import assert from "node:assert/strict";
import { AiCoreClient, SpendLimitExceededError } from "../client";
import { KillSwitchRegistry } from "../security";
import {
  fakeFetchResponses,
  fakeFetchError,
  RecordingTelemetrySink,
  StaticKeyProvider,
} from "./test-helpers";
import type { TenantContext, SpendGuard } from "../types";

const tenant: TenantContext = {
  organizationId: "org_1",
  projectId: "proj_1",
  agentId: "agent_comercial",
};

test("complete: chamada bem-sucedida registra telemetria SUCCESS com tokens e custo", async () => {
  const telemetry = new RecordingTelemetrySink();
  const client = new AiCoreClient({
    keyProvider: new StaticKeyProvider(),
    telemetrySink: telemetry,
    fetch: fakeFetchResponses("Olá, como posso ajudar?"),
  });

  const result = await client.complete({
    tenant,
    model: "gpt-4o-mini",
    input: "Oi",
  });

  assert.equal(result.outputText, "Olá, como posso ajudar?");
  assert.equal(result.inputTokens, 10);
  assert.equal(result.outputTokens, 20);
  assert.ok(result.estimatedCostUsd > 0);
  assert.equal(telemetry.events.length, 1);
  assert.equal(telemetry.events[0].outcome, "SUCCESS");
  assert.equal(telemetry.events[0].tenant.projectId, "proj_1");
});

test("complete: erro da API registra telemetria ERROR e propaga a exceção", async () => {
  const telemetry = new RecordingTelemetrySink();
  const client = new AiCoreClient({
    keyProvider: new StaticKeyProvider(),
    telemetrySink: telemetry,
    fetch: fakeFetchError(429, "Rate limit exceeded"),
  });

  await assert.rejects(() =>
    client.complete({ tenant, model: "gpt-4o-mini", input: "Oi" }),
  );

  assert.equal(telemetry.events.length, 1);
  assert.equal(telemetry.events[0].outcome, "ERROR");
});

test("complete: kill switch ativo para o agente bloqueia a chamada antes de ir à rede", async () => {
  const telemetry = new RecordingTelemetrySink();
  const killSwitch = new KillSwitchRegistry();
  killSwitch.blockAgent("agent_comercial");

  const client = new AiCoreClient({
    keyProvider: new StaticKeyProvider(),
    telemetrySink: telemetry,
    killSwitch,
    fetch: fakeFetchResponses("não deveria chegar aqui"),
  });

  await assert.rejects(
    () => client.complete({ tenant, model: "gpt-4o-mini", input: "Oi" }),
    /Kill switch ativo/,
  );
  assert.equal(telemetry.events.length, 0, "nenhuma chamada de rede deve ter ocorrido");
});

test("complete: entrada maior que o limite é rejeitada antes da chamada", async () => {
  const telemetry = new RecordingTelemetrySink();
  const client = new AiCoreClient({
    keyProvider: new StaticKeyProvider(),
    telemetrySink: telemetry,
    maxInputLength: 10,
    fetch: fakeFetchResponses("não deveria chegar aqui"),
  });

  await assert.rejects(
    () =>
      client.complete({
        tenant,
        model: "gpt-4o-mini",
        input: "Um texto de entrada bem maior que o limite permitido",
      }),
    /excede o limite/,
  );
});

test("complete: spend guard bloqueando marca telemetria como BLOCKED, sem chamar a OpenAI", async () => {
  const telemetry = new RecordingTelemetrySink();
  let fetchCalled = false;
  const blockingSpendGuard: SpendGuard = {
    async reserve() {
      return { limitUsd: 1, spentUsd: 1, blocked: true };
    },
    async confirm() {},
    async release() {},
    async releaseStaleReservations() {
      return 0;
    },
  };

  const client = new AiCoreClient({
    keyProvider: new StaticKeyProvider(),
    telemetrySink: telemetry,
    spendGuard: blockingSpendGuard,
    fetch: async () => {
      fetchCalled = true;
      return fakeFetchResponses("resposta")();
    },
  });

  await assert.rejects(
    () => client.complete({ tenant, model: "gpt-4o-mini", input: "Oi" }),
    SpendLimitExceededError,
  );
  assert.equal(telemetry.events[0].outcome, "BLOCKED");
  assert.equal(fetchCalled, false, "reserva bloqueada não deve chegar a chamar a API");
});

test("complete: sucesso chama reserve() antes e confirm() depois, com o custo real", async () => {
  const telemetry = new RecordingTelemetrySink();
  const calls: string[] = [];
  let confirmedCost: number | undefined;

  const trackingSpendGuard: SpendGuard = {
    async reserve() {
      calls.push("reserve");
      return { limitUsd: 100, spentUsd: 0, blocked: false, reservationId: "res_1" };
    },
    async confirm(reservationId, actualCostUsd) {
      calls.push("confirm");
      assert.equal(reservationId, "res_1");
      confirmedCost = actualCostUsd;
    },
    async release() {
      calls.push("release");
    },
    async releaseStaleReservations() {
      return 0;
    },
  };

  const client = new AiCoreClient({
    keyProvider: new StaticKeyProvider(),
    telemetrySink: telemetry,
    spendGuard: trackingSpendGuard,
    fetch: fakeFetchResponses("resposta"),
  });

  await client.complete({ tenant, model: "gpt-4o-mini", input: "Oi" });

  assert.deepEqual(calls, ["reserve", "confirm"]);
  assert.ok(confirmedCost !== undefined && confirmedCost > 0);
});

test("complete: erro da API chama release() para devolver a reserva, sem confirm()", async () => {
  const telemetry = new RecordingTelemetrySink();
  const calls: string[] = [];

  const trackingSpendGuard: SpendGuard = {
    async reserve() {
      calls.push("reserve");
      return { limitUsd: 100, spentUsd: 0, blocked: false, reservationId: "res_2" };
    },
    async confirm() {
      calls.push("confirm");
    },
    async release(reservationId) {
      calls.push("release");
      assert.equal(reservationId, "res_2");
    },
    async releaseStaleReservations() {
      return 0;
    },
  };

  const client = new AiCoreClient({
    keyProvider: new StaticKeyProvider(),
    telemetrySink: telemetry,
    spendGuard: trackingSpendGuard,
    fetch: fakeFetchError(500, "Internal error"),
  });

  await assert.rejects(() => client.complete({ tenant, model: "gpt-4o-mini", input: "Oi" }));

  assert.deepEqual(calls, ["reserve", "release"]);
});

test("complete: falha ao gravar telemetria não derruba a chamada original", async () => {
  const client = new AiCoreClient({
    keyProvider: new StaticKeyProvider(),
    telemetrySink: {
      async record() {
        throw new Error("banco fora do ar");
      },
    },
    fetch: fakeFetchResponses("resposta ok"),
  });

  const result = await client.complete({ tenant, model: "gpt-4o-mini", input: "Oi" });
  assert.equal(result.outputText, "resposta ok");
});
