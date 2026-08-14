import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { PrismaSpendGuard } from "../spend-guard";
import { setupTestTenants } from "./test-setup";
import type { TenantContext } from "@avila-ops/ai-core";

async function createPolicy(organizationId: string, projectId: string, limitUsd: number) {
  const now = new Date();
  return prisma.aiCoreSpendPolicy.create({
    data: {
      organizationId,
      projectId,
      environment: "production",
      periodStart: new Date(now.getFullYear(), now.getMonth(), 1),
      periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      limitUsd,
    },
  });
}

test("PrismaSpendGuard: reserve() dentro do limite é aprovado e incrementa o gasto", async () => {
  const { orgA, cleanup } = await setupTestTenants();
  try {
    await createPolicy(orgA.id, "proj_1", 10);
    const guard = new PrismaSpendGuard();
    const tenant: TenantContext = { organizationId: orgA.id, projectId: "proj_1", agentId: "a1" };

    const status = await guard.reserve(tenant, "req_1", 3);
    assert.equal(status.blocked, false);
    assert.equal(status.spentUsd, 3);
    assert.ok(status.reservationId);

    const reservation = await prisma.aiCoreSpendReservation.findUnique({
      where: { id: status.reservationId! },
    });
    assert.equal(reservation?.status, "RESERVED");
    assert.equal(Number(reservation?.estimatedCostUsd), 3);
  } finally {
    await cleanup();
  }
});

test("PrismaSpendGuard: reserve() que excede o limite sozinho é bloqueado, sem reservationId", async () => {
  const { orgA, cleanup } = await setupTestTenants();
  try {
    await createPolicy(orgA.id, "proj_1", 5);
    const guard = new PrismaSpendGuard();
    const tenant: TenantContext = { organizationId: orgA.id, projectId: "proj_1", agentId: "a1" };

    const status = await guard.reserve(tenant, "req_1", 10);
    assert.equal(status.blocked, true);
    assert.equal(status.reservationId, undefined);
  } finally {
    await cleanup();
  }
});

test("PrismaSpendGuard: confirm() com custo real menor que o estimado reduz o acumulado pela diferença", async () => {
  const { orgA, cleanup } = await setupTestTenants();
  try {
    await createPolicy(orgA.id, "proj_1", 10);
    const guard = new PrismaSpendGuard();
    const tenant: TenantContext = { organizationId: orgA.id, projectId: "proj_1", agentId: "a1" };

    const status = await guard.reserve(tenant, "req_1", 5); // reserva otimista de $5
    await guard.confirm(status.reservationId!, 2); // custo real foi só $2

    const policy = await prisma.aiCoreSpendPolicy.findFirst({
      where: { organizationId: orgA.id, projectId: "proj_1" },
    });
    assert.equal(Number(policy?.spentUsd), 2, "acumulado deve refletir o custo real, não o estimado");

    const reservation = await prisma.aiCoreSpendReservation.findUnique({
      where: { id: status.reservationId! },
    });
    assert.equal(reservation?.status, "CONFIRMED");
    assert.equal(Number(reservation?.actualCostUsd), 2);
  } finally {
    await cleanup();
  }
});

test("PrismaSpendGuard: confirm() com custo real maior que o estimado aumenta o acumulado pela diferença", async () => {
  const { orgA, cleanup } = await setupTestTenants();
  try {
    await createPolicy(orgA.id, "proj_1", 10);
    const guard = new PrismaSpendGuard();
    const tenant: TenantContext = { organizationId: orgA.id, projectId: "proj_1", agentId: "a1" };

    const status = await guard.reserve(tenant, "req_1", 2);
    await guard.confirm(status.reservationId!, 5);

    const policy = await prisma.aiCoreSpendPolicy.findFirst({
      where: { organizationId: orgA.id, projectId: "proj_1" },
    });
    assert.equal(Number(policy?.spentUsd), 5);
  } finally {
    await cleanup();
  }
});

test("PrismaSpendGuard: release() reverte por completo o valor reservado", async () => {
  const { orgA, cleanup } = await setupTestTenants();
  try {
    await createPolicy(orgA.id, "proj_1", 10);
    const guard = new PrismaSpendGuard();
    const tenant: TenantContext = { organizationId: orgA.id, projectId: "proj_1", agentId: "a1" };

    const status = await guard.reserve(tenant, "req_1", 4);
    await guard.release(status.reservationId!);

    const policy = await prisma.aiCoreSpendPolicy.findFirst({
      where: { organizationId: orgA.id, projectId: "proj_1" },
    });
    assert.equal(Number(policy?.spentUsd), 0, "gasto deve voltar a zero após liberar a reserva");

    const reservation = await prisma.aiCoreSpendReservation.findUnique({
      where: { id: status.reservationId! },
    });
    assert.equal(reservation?.status, "RELEASED");
  } finally {
    await cleanup();
  }
});

test("PrismaSpendGuard: confirm() é idempotente — chamar duas vezes não ajusta o acumulado duas vezes", async () => {
  const { orgA, cleanup } = await setupTestTenants();
  try {
    await createPolicy(orgA.id, "proj_1", 10);
    const guard = new PrismaSpendGuard();
    const tenant: TenantContext = { organizationId: orgA.id, projectId: "proj_1", agentId: "a1" };

    const status = await guard.reserve(tenant, "req_1", 3);
    await guard.confirm(status.reservationId!, 1);
    await guard.confirm(status.reservationId!, 1); // segunda chamada não deve fazer nada

    const policy = await prisma.aiCoreSpendPolicy.findFirst({
      where: { organizationId: orgA.id, projectId: "proj_1" },
    });
    assert.equal(Number(policy?.spentUsd), 1);
  } finally {
    await cleanup();
  }
});

test("PrismaSpendGuard: release() após confirm() não desfaz o ajuste já confirmado", async () => {
  const { orgA, cleanup } = await setupTestTenants();
  try {
    await createPolicy(orgA.id, "proj_1", 10);
    const guard = new PrismaSpendGuard();
    const tenant: TenantContext = { organizationId: orgA.id, projectId: "proj_1", agentId: "a1" };

    const status = await guard.reserve(tenant, "req_1", 3);
    await guard.confirm(status.reservationId!, 3);
    await guard.release(status.reservationId!); // chamada tardia/duplicada, deve ser no-op

    const policy = await prisma.aiCoreSpendPolicy.findFirst({
      where: { organizationId: orgA.id, projectId: "proj_1" },
    });
    assert.equal(Number(policy?.spentUsd), 3, "release() após confirm() não deve alterar o acumulado");
  } finally {
    await cleanup();
  }
});

test("PrismaSpendGuard: 20 reservas concorrentes de $1 cada com limite de $10 nunca ultrapassam $10", async () => {
  const { orgA, cleanup } = await setupTestTenants();
  try {
    await createPolicy(orgA.id, "proj_concorrencia", 10);
    const guard = new PrismaSpendGuard();
    const tenant: TenantContext = {
      organizationId: orgA.id,
      projectId: "proj_concorrencia",
      agentId: "a1",
    };

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => guard.reserve(tenant, `req_${i}`, 1)),
    );

    const approved = results.filter((result) => !result.blocked);
    const blocked = results.filter((result) => result.blocked);

    assert.equal(approved.length, 10, "exatamente 10 reservas de $1 devem caber no limite de $10");
    assert.equal(blocked.length, 10);

    const policy = await prisma.aiCoreSpendPolicy.findFirst({
      where: { organizationId: orgA.id, projectId: "proj_concorrencia" },
    });
    assert.equal(Number(policy?.spentUsd), 10, "gasto final nunca deve ultrapassar o limite");
  } finally {
    await cleanup();
  }
});

test("PrismaSpendGuard: organização A e B com projetos de mesmo nome têm orçamentos independentes", async () => {
  const { orgA, orgB, cleanup } = await setupTestTenants();
  try {
    await createPolicy(orgA.id, "proj_x", 5);
    await createPolicy(orgB.id, "proj_x", 5);
    const guard = new PrismaSpendGuard();

    await guard.reserve({ organizationId: orgA.id, projectId: "proj_x", agentId: "a1" }, "req_a", 5);
    const statusB = await guard.reserve(
      { organizationId: orgB.id, projectId: "proj_x", agentId: "a1" },
      "req_b",
      5,
    );

    assert.equal(statusB.blocked, false, "esgotar o orçamento da org A não deve afetar a org B");
  } finally {
    await cleanup();
  }
});

test("PrismaSpendGuard: sem política cadastrada não bloqueia e não persiste reserva", async () => {
  const { orgA, cleanup } = await setupTestTenants();
  try {
    const guard = new PrismaSpendGuard();
    const status = await guard.reserve(
      { organizationId: orgA.id, projectId: "proj_sem_policy", agentId: "a1" },
      "req_1",
      100,
    );
    assert.equal(status.blocked, false);
    assert.equal(status.limitUsd, 0);
    assert.equal(status.reservationId, undefined);
  } finally {
    await cleanup();
  }
});

test("PrismaSpendGuard: releaseStaleReservations() libera reservas RESERVED antigas e devolve o orçamento", async () => {
  const { orgA, cleanup } = await setupTestTenants();
  try {
    await createPolicy(orgA.id, "proj_1", 10);
    const guard = new PrismaSpendGuard();
    const tenant: TenantContext = { organizationId: orgA.id, projectId: "proj_1", agentId: "a1" };

    const status = await guard.reserve(tenant, "req_orfa", 4);

    // Simula uma reserva antiga "esquecida" retrocedendo created_at manualmente.
    await prisma.aiCoreSpendReservation.update({
      where: { id: status.reservationId! },
      data: { createdAt: new Date(Date.now() - 60_000) },
    });

    const releasedCount = await guard.releaseStaleReservations(30_000);
    assert.equal(releasedCount, 1);

    const reservation = await prisma.aiCoreSpendReservation.findUnique({
      where: { id: status.reservationId! },
    });
    assert.equal(reservation?.status, "RELEASED");

    const policy = await prisma.aiCoreSpendPolicy.findFirst({
      where: { organizationId: orgA.id, projectId: "proj_1" },
    });
    assert.equal(Number(policy?.spentUsd), 0, "orçamento deve ser devolvido");
  } finally {
    await cleanup();
  }
});

test("PrismaSpendGuard: releaseStaleReservations() não afeta reservas recentes", async () => {
  const { orgA, cleanup } = await setupTestTenants();
  try {
    await createPolicy(orgA.id, "proj_1", 10);
    const guard = new PrismaSpendGuard();
    const tenant: TenantContext = { organizationId: orgA.id, projectId: "proj_1", agentId: "a1" };

    await guard.reserve(tenant, "req_recente", 4);
    const releasedCount = await guard.releaseStaleReservations(60_000);

    assert.equal(releasedCount, 0);
    const policy = await prisma.aiCoreSpendPolicy.findFirst({
      where: { organizationId: orgA.id, projectId: "proj_1" },
    });
    assert.equal(Number(policy?.spentUsd), 4, "reserva recente deve permanecer intacta");
  } finally {
    await cleanup();
  }
});

test("PrismaSpendGuard: tenant.source='TEST' registra a reserva mas nunca toca no orçamento real (reserve/confirm)", async () => {
  const { orgA, cleanup } = await setupTestTenants();
  try {
    await createPolicy(orgA.id, "proj_1", 10);
    const guard = new PrismaSpendGuard();
    const tenant: TenantContext = {
      organizationId: orgA.id,
      projectId: "proj_1",
      agentId: "a1",
      source: "TEST",
    };

    const status = await guard.reserve(tenant, "req_smoketest", 5);
    assert.equal(status.blocked, false);
    assert.equal(status.spentUsd, 0, "reserva de teste não deve incrementar spent_usd");

    await guard.confirm(status.reservationId!, 3);

    const policy = await prisma.aiCoreSpendPolicy.findFirst({
      where: { organizationId: orgA.id, projectId: "proj_1" },
    });
    assert.equal(Number(policy?.spentUsd), 0, "confirmação de reserva de teste não deve afetar o orçamento real");

    const reservation = await prisma.aiCoreSpendReservation.findUnique({
      where: { id: status.reservationId! },
    });
    assert.equal(reservation?.source, "TEST");
    assert.equal(reservation?.status, "CONFIRMED");
    assert.equal(Number(reservation?.actualCostUsd), 3, "custo real continua registrado para auditoria");
  } finally {
    await cleanup();
  }
});

test("PrismaSpendGuard: tenant.source='TEST' e reserva de produção não interferem entre si no mesmo projeto", async () => {
  const { orgA, cleanup } = await setupTestTenants();
  try {
    await createPolicy(orgA.id, "proj_1", 10);
    const guard = new PrismaSpendGuard();

    await guard.reserve(
      { organizationId: orgA.id, projectId: "proj_1", agentId: "a1", source: "TEST" },
      "req_test",
      100, // valor absurdamente alto — se afetasse o orçamento real, bloquearia tudo
    );

    const statusProd = await guard.reserve(
      { organizationId: orgA.id, projectId: "proj_1", agentId: "a1" },
      "req_prod",
      5,
    );

    assert.equal(statusProd.blocked, false, "reserva real não deve ser afetada por reserva de teste anterior");
    assert.equal(statusProd.spentUsd, 5);
  } finally {
    await cleanup();
  }
});
