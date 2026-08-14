import { test } from "node:test";
import assert from "node:assert/strict";
import {
  redactForLogging,
  assertInputSize,
  InputTooLargeError,
  KillSwitchRegistry,
  KillSwitchActiveError,
  assertAllowedDestination,
} from "../security";
import type { TenantContext } from "../types";

test("redactForLogging: remove CPF, e-mail e telefone de um texto", () => {
  const text = "Cliente João, CPF 123.456.789-09, e-mail joao@exemplo.com, tel (11) 98888-7777";
  const redacted = redactForLogging(text);
  assert.ok(!redacted.includes("123.456.789-09"));
  assert.ok(!redacted.includes("joao@exemplo.com"));
  assert.ok(redacted.includes("[CPF_REDACTED]"));
  assert.ok(redacted.includes("[EMAIL_REDACTED]"));
});

test("assertInputSize: não lança para entrada dentro do limite", () => {
  assert.doesNotThrow(() => assertInputSize("abc", 10));
});

test("assertInputSize: lança InputTooLargeError para entrada acima do limite", () => {
  assert.throws(() => assertInputSize("a".repeat(20), 10), InputTooLargeError);
});

test("KillSwitchRegistry: bloqueia por agente e libera depois", () => {
  const registry = new KillSwitchRegistry();
  const tenant: TenantContext = { organizationId: "o1", projectId: "p1", agentId: "a1" };

  assert.doesNotThrow(() => registry.assertAllowed(tenant));

  registry.blockAgent("a1");
  assert.throws(() => registry.assertAllowed(tenant), KillSwitchActiveError);

  registry.unblockAgent("a1");
  assert.doesNotThrow(() => registry.assertAllowed(tenant));
});

test("KillSwitchRegistry: bloqueia por projeto independentemente do agente", () => {
  const registry = new KillSwitchRegistry();
  const tenant: TenantContext = { organizationId: "o1", projectId: "p1", agentId: "a1" };

  registry.blockProject("p1");
  assert.throws(() => registry.assertAllowed(tenant), KillSwitchActiveError);
});

test("assertAllowedDestination: aceita domínio na allowlist e subdomínios", () => {
  assert.doesNotThrow(() =>
    assertAllowedDestination("https://api.exemplo.com/v1", ["exemplo.com"]),
  );
});

test("assertAllowedDestination: rejeita domínio fora da allowlist", () => {
  assert.throws(() =>
    assertAllowedDestination("https://malicioso.com/roubo", ["exemplo.com"]),
  );
});
