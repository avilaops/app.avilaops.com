import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  ToolRegistry,
  ToolNotAllowedError,
  ToolApprovalPendingError,
  ToolApprovalRejectedError,
} from "../tools";
import { InMemoryApprovalStore } from "../approval";
import type { TenantContext } from "../types";

const tenant: TenantContext = {
  organizationId: "org_1",
  projectId: "proj_1",
  agentId: "agent_comercial",
};

function buildRegistry() {
  const registry = new ToolRegistry();
  registry.register({
    name: "create_crm_lead",
    description: "Cria um lead no CRM",
    accessLevel: "WRITE",
    requiresApproval: true,
    inputSchema: z.object({ name: z.string(), email: z.string() }),
    idempotencyKey: (input) => input.email,
    execute: async (input) => ({ id: "lead_1", ...input }),
  });
  registry.register({
    name: "lookup_lead",
    description: "Consulta um lead",
    accessLevel: "READ",
    requiresApproval: false,
    inputSchema: z.object({ email: z.string() }),
    idempotencyKey: (input) => input.email,
    execute: async (input) => ({ found: true, email: input.email }),
  });
  return registry;
}

test("execute: ferramenta não concedida ao agente lança ToolNotAllowedError", async () => {
  const registry = buildRegistry();
  await assert.rejects(
    () => registry.execute("lookup_lead", { email: "a@b.com" }, tenant),
    ToolNotAllowedError,
  );
});

test("execute: ferramenta READ sem aprovação executa direto quando concedida", async () => {
  const registry = buildRegistry();
  registry.grant(tenant.agentId, "lookup_lead");

  const result = await registry.execute<{ email: string }, { found: boolean; email: string }>(
    "lookup_lead",
    { email: "a@b.com" },
    tenant,
  );
  assert.deepEqual(result, { found: true, email: "a@b.com" });
});

test("execute: ferramenta WRITE com aprovação pendente lança ToolApprovalPendingError", async () => {
  const registry = buildRegistry();
  registry.grant(tenant.agentId, "create_crm_lead");
  const approvalStore = new InMemoryApprovalStore();

  await assert.rejects(
    () =>
      registry.execute(
        "create_crm_lead",
        { name: "João", email: "joao@exemplo.com" },
        tenant,
        approvalStore,
      ),
    ToolApprovalPendingError,
  );
});

test("execute: ferramenta WRITE aprovada executa e fica idempotente numa segunda tentativa", async () => {
  const registry = buildRegistry();
  registry.grant(tenant.agentId, "create_crm_lead");
  const approvalStore = new InMemoryApprovalStore();

  await assert.rejects(() =>
    registry.execute(
      "create_crm_lead",
      { name: "João", email: "joao@exemplo.com" },
      tenant,
      approvalStore,
    ),
  );

  const pending = approvalStore.listPending({ organizationId: tenant.organizationId });
  assert.equal(pending.length, 1);
  approvalStore.decide(pending[0].id, "APPROVED");

  const result = await registry.execute<
    { name: string; email: string },
    { id: string; name: string; email: string }
  >("create_crm_lead", { name: "João", email: "joao@exemplo.com" }, tenant, approvalStore);
  assert.equal(result.id, "lead_1");

  await assert.rejects(
    () =>
      registry.execute(
        "create_crm_lead",
        { name: "João", email: "joao@exemplo.com" },
        tenant,
        approvalStore,
      ),
    /idempotência/,
  );
});

test("execute: ferramenta rejeitada na aprovação lança ToolApprovalRejectedError", async () => {
  const registry = buildRegistry();
  registry.grant(tenant.agentId, "create_crm_lead");
  const approvalStore = new InMemoryApprovalStore();

  await assert.rejects(() =>
    registry.execute(
      "create_crm_lead",
      { name: "Maria", email: "maria@exemplo.com" },
      tenant,
      approvalStore,
    ),
  );
  const pending = approvalStore.listPending();
  approvalStore.decide(pending[0].id, "REJECTED");

  await assert.rejects(
    () =>
      registry.execute(
        "create_crm_lead",
        { name: "Maria", email: "maria@exemplo.com" },
        tenant,
        approvalStore,
      ),
    ToolApprovalRejectedError,
  );
});
