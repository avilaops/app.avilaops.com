import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { PrismaApprovalStore } from "../approval-store";
import { setupTestTenants } from "./test-setup";
import type { TenantContext } from "@avila-ops/ai-core";

test("PrismaApprovalStore: duas solicitações idênticas geram uma única aprovação (idempotência via unique constraint)", async () => {
  const { orgA, cleanup } = await setupTestTenants();
  try {
    const store = new PrismaApprovalStore();
    const tenant: TenantContext = {
      organizationId: orgA.id,
      projectId: "proj_comercial",
      agentId: "agent_comercial",
    };
    const payload = { email: "lead@exemplo.com", name: "Lead Teste" };

    const first = await store.create({
      tenant,
      toolName: "create_crm_lead",
      summary: "Criar lead",
      payload,
    });
    const second = await store.create({
      tenant,
      toolName: "create_crm_lead",
      summary: "Criar lead",
      payload,
    });

    assert.equal(first.id, second.id, "mesma chamada com mesmo payload deve reutilizar o pedido");

    const count = await prisma.aiCoreApproval.count({
      where: { organizationId: orgA.id, toolName: "create_crm_lead" },
    });
    assert.equal(count, 1);
  } finally {
    await cleanup();
  }
});

test("PrismaApprovalStore: organização A não enxerga aprovações da organização B (isolamento de tenant)", async () => {
  const { orgA, orgB, cleanup } = await setupTestTenants();
  try {
    const store = new PrismaApprovalStore();
    await store.create({
      tenant: { organizationId: orgA.id, projectId: "proj_a", agentId: "agent_a" },
      toolName: "create_crm_lead",
      summary: "Lead da org A",
      payload: { email: "a@exemplo.com" },
    });
    await store.create({
      tenant: { organizationId: orgB.id, projectId: "proj_b", agentId: "agent_b" },
      toolName: "create_crm_lead",
      summary: "Lead da org B",
      payload: { email: "b@exemplo.com" },
    });

    const approvalsOfA = await prisma.aiCoreApproval.findMany({
      where: { organizationId: orgA.id },
    });
    const approvalsOfB = await prisma.aiCoreApproval.findMany({
      where: { organizationId: orgB.id },
    });

    assert.equal(approvalsOfA.length, 1);
    assert.equal(approvalsOfB.length, 1);
    assert.notEqual(approvalsOfA[0].id, approvalsOfB[0].id);
    assert.equal(approvalsOfA[0].summary, "Lead da org A");
    assert.equal(approvalsOfB[0].summary, "Lead da org B");
  } finally {
    await cleanup();
  }
});

test("PrismaApprovalStore: aprovação expirada não é executável (getDecision retorna null e marca EXPIRED)", async () => {
  const { orgA, cleanup } = await setupTestTenants();
  try {
    const shortTtlStore = new PrismaApprovalStore(1);
    const tenant: TenantContext = {
      organizationId: orgA.id,
      projectId: "proj_comercial",
      agentId: "agent_comercial",
    };

    const request = await shortTtlStore.create({
      tenant,
      toolName: "create_crm_lead",
      summary: "Lead que vai expirar",
      payload: { email: "expira@exemplo.com" },
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    const decision = await shortTtlStore.getDecision(request.id);
    assert.equal(decision, null);

    const record = await prisma.aiCoreApproval.findUnique({ where: { id: request.id } });
    assert.equal(record?.status, "EXPIRED");
  } finally {
    await cleanup();
  }
});

test("PrismaApprovalStore: decide() só afeta pedidos PENDING, aprovação já decidida não é sobrescrita", async () => {
  const { orgA, cleanup } = await setupTestTenants();
  try {
    const store = new PrismaApprovalStore();
    const tenant: TenantContext = {
      organizationId: orgA.id,
      projectId: "proj_comercial",
      agentId: "agent_comercial",
    };

    const request = await store.create({
      tenant,
      toolName: "create_crm_lead",
      summary: "Lead",
      payload: { email: "decisao@exemplo.com" },
    });

    const first = await store.decide(request.id, "REJECTED", "admin_1", "Escopo não previsto no piloto");
    const second = await store.decide(request.id, "APPROVED", "admin_2");

    assert.equal(first.applied, true);
    assert.equal(second.applied, false, "segunda decisão sobre pedido já resolvido não deve aplicar");

    const record = await prisma.aiCoreApproval.findUnique({ where: { id: request.id } });
    assert.equal(record?.status, "REJECTED", "segunda decisão não deve sobrescrever a primeira");
    assert.equal(record?.decidedBy, "admin_1");
    assert.equal(record?.rejectionReason, "Escopo não previsto no piloto");
  } finally {
    await cleanup();
  }
});
