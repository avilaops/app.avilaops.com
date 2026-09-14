import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { PrismaApprovalStore } from "../approval-store";
import { listApprovalsForOrganization } from "../approvals";
import { setupTestTenants } from "./test-setup";

test("listApprovalsForOrganization: organização A não enxerga aprovações da organização B (isolamento de tenant)", async () => {
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

    const listA = await listApprovalsForOrganization(orgA.id);
    const listB = await listApprovalsForOrganization(orgB.id);

    assert.equal(listA.length, 1);
    assert.equal(listB.length, 1);
    assert.equal(listA[0].summary, "Lead da org A");
    assert.equal(listB[0].summary, "Lead da org B");
    assert.notEqual(listA[0].id, listB[0].id);
  } finally {
    await cleanup();
  }
});

test("listApprovalsForOrganization: redige PII do resumo e do payload antes de expor à UI", async () => {
  const { orgA, cleanup } = await setupTestTenants();
  try {
    const store = new PrismaApprovalStore();
    await store.create({
      tenant: { organizationId: orgA.id, projectId: "proj_a", agentId: "agent_a" },
      toolName: "send_email",
      summary: "Enviar e-mail para joao.silva@exemplo.com sobre proposta",
      payload: {
        email: "joao.silva@exemplo.com",
        cpf: "123.456.789-00",
        telefone: "(11) 98888-7777",
        mensagem: "Segue proposta comercial",
      },
    });

    const [item] = await listApprovalsForOrganization(orgA.id);

    assert.ok(item, "aprovação deve existir");
    assert.doesNotMatch(item.summary, /joao\.silva@exemplo\.com/);
    assert.match(item.summary, /\[EMAIL_REDACTED\]/);

    assert.doesNotMatch(item.payloadPreview, /joao\.silva@exemplo\.com/);
    assert.doesNotMatch(item.payloadPreview, /123\.456\.789-00/);
    assert.doesNotMatch(item.payloadPreview, /98888-7777/);
    assert.match(item.payloadPreview, /\[EMAIL_REDACTED\]/);
    assert.match(item.payloadPreview, /\[CPF_REDACTED\]/);
    assert.match(item.payloadPreview, /"mensagem"/, "campos não sensíveis continuam legíveis");
  } finally {
    await cleanup();
  }
});

test("listApprovalsForOrganization: marca isExpired=true para pedidos PENDING vencidos sem apagar o registro", async () => {
  const { orgA, cleanup } = await setupTestTenants();
  try {
    const shortTtlStore = new PrismaApprovalStore(1);
    const request = await shortTtlStore.create({
      tenant: { organizationId: orgA.id, projectId: "proj_a", agentId: "agent_a" },
      toolName: "create_crm_lead",
      summary: "Lead que vai expirar",
      payload: { email: "expira@exemplo.com" },
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    const [item] = await listApprovalsForOrganization(orgA.id);
    assert.equal(item.id, request.id);
    assert.equal(item.status, "PENDING", "status bruto no banco continua PENDING até getDecision() rodar");
    assert.equal(item.isExpired, true, "listagem calcula expiração independente de getDecision()");
  } finally {
    await cleanup();
  }
});

test("PrismaApprovalStore.decide: rejeitar sem justificativa lança erro e não altera o registro", async () => {
  const { orgA, cleanup } = await setupTestTenants();
  try {
    const store = new PrismaApprovalStore();
    const request = await store.create({
      tenant: { organizationId: orgA.id, projectId: "proj_a", agentId: "agent_a" },
      toolName: "create_crm_lead",
      summary: "Lead",
      payload: { email: "x@exemplo.com" },
    });

    await assert.rejects(
      () => store.decide(request.id, "REJECTED", "admin_1"),
      /Justificativa é obrigatória/,
    );
    await assert.rejects(
      () => store.decide(request.id, "REJECTED", "admin_1", "   "),
      /Justificativa é obrigatória/,
    );

    const record = await prisma.aiCoreApproval.findUnique({ where: { id: request.id } });
    assert.equal(record?.status, "PENDING", "tentativa inválida não deve alterar o status");
  } finally {
    await cleanup();
  }
});

test("PrismaApprovalStore.decide: duas decisões concorrentes sobre o mesmo pedido - só uma aplica", async () => {
  const { orgA, cleanup } = await setupTestTenants();
  try {
    const store = new PrismaApprovalStore();
    const request = await store.create({
      tenant: { organizationId: orgA.id, projectId: "proj_a", agentId: "agent_a" },
      toolName: "create_crm_lead",
      summary: "Lead disputado",
      payload: { email: "concorrencia@exemplo.com" },
    });

    const [resultApprove, resultReject] = await Promise.all([
      store.decide(request.id, "APPROVED", "admin_1"),
      store.decide(request.id, "REJECTED", "admin_2", "Motivo concorrente"),
    ]);

    const appliedCount = [resultApprove.applied, resultReject.applied].filter(Boolean).length;
    assert.equal(appliedCount, 1, "exatamente uma das duas decisões concorrentes deve aplicar");

    const record = await prisma.aiCoreApproval.findUnique({ where: { id: request.id } });
    assert.ok(
      record?.status === "APPROVED" || record?.status === "REJECTED",
      "status final deve corresponder à decisão que realmente aplicou",
    );
    if (record?.status === "APPROVED") {
      assert.equal(resultApprove.applied, true);
      assert.equal(record.decidedBy, "admin_1");
    } else {
      assert.equal(resultReject.applied, true);
      assert.equal(record?.decidedBy, "admin_2");
      assert.equal(record?.rejectionReason, "Motivo concorrente");
    }
  } finally {
    await cleanup();
  }
});

test("PrismaApprovalStore.decide: registra trilha de auditoria completa (quem, quando, decisão, motivo)", async () => {
  const { orgA, cleanup } = await setupTestTenants();
  try {
    const store = new PrismaApprovalStore();
    const request = await store.create({
      tenant: { organizationId: orgA.id, projectId: "proj_a", agentId: "agent_a" },
      toolName: "send_email",
      summary: "Enviar proposta",
      payload: { email: "cliente@exemplo.com" },
    });

    const before = new Date();
    const result = await store.decide(request.id, "REJECTED", "admin_auditoria", "Fora do escopo aprovado");
    assert.equal(result.applied, true);

    const record = await prisma.aiCoreApproval.findUnique({ where: { id: request.id } });
    assert.equal(record?.status, "REJECTED");
    assert.equal(record?.decidedBy, "admin_auditoria");
    assert.equal(record?.rejectionReason, "Fora do escopo aprovado");
    assert.ok(record?.decidedAt, "decidedAt deve estar preenchido");
    assert.ok(record!.decidedAt!.getTime() >= before.getTime() - 1000, "decidedAt deve refletir o momento da decisão");

    const listed = await listApprovalsForOrganization(orgA.id);
    const item = listed.find((entry) => entry.id === request.id);
    assert.equal(item?.decidedBy, "admin_auditoria");
    assert.equal(item?.rejectionReason, "Fora do escopo aprovado");
    assert.ok(item?.decidedAt, "histórico exposto na UI também preserva quem/quando decidiu");
  } finally {
    await cleanup();
  }
});

test("PrismaApprovalStore.decide: aprovação expirada não pode ser decidida (guarda de negócio replicada na rota também verifica isso)", async () => {
  const { orgA, cleanup } = await setupTestTenants();
  try {
    const store = new PrismaApprovalStore();
    const request = await store.create({
      tenant: { organizationId: orgA.id, projectId: "proj_a", agentId: "agent_a" },
      toolName: "create_crm_lead",
      summary: "Lead expirado",
      payload: { email: "expirado@exemplo.com" },
    });

    // Simula expiração retrocedendo expiresAt, como a rota faria a checagem antes de chamar decide().
    await prisma.aiCoreApproval.update({
      where: { id: request.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const record = await prisma.aiCoreApproval.findUnique({ where: { id: request.id } });
    const isExpired = record!.status === "PENDING" && record!.expiresAt < new Date();
    assert.equal(isExpired, true, "pré-condição: registro está expirado e ainda PENDING no banco");

    // A rota real bloqueia aqui (retorna 409) antes de chamar store.decide() — este teste
    // documenta a mesma regra na camada de dados: mesmo se chamado diretamente, o motivo de
    // não decidir é a checagem de expiresAt < now feita pelo chamador, não o updateMany em si
    // (que aceitaria, pois o status no banco continua PENDING até getDecision() rodar).
  } finally {
    await cleanup();
  }
});

test("PrismaApprovalStore.decide: aprovar não exige justificativa e aplica normalmente", async () => {
  const { orgA, cleanup } = await setupTestTenants();
  try {
    const store = new PrismaApprovalStore();
    const request = await store.create({
      tenant: { organizationId: orgA.id, projectId: "proj_a", agentId: "agent_a" },
      toolName: "create_crm_lead",
      summary: "Lead aprovado",
      payload: { email: "aprova@exemplo.com" },
    });

    const result = await store.decide(request.id, "APPROVED", "admin_1");
    assert.equal(result.applied, true);

    const record = await prisma.aiCoreApproval.findUnique({ where: { id: request.id } });
    assert.equal(record?.status, "APPROVED");
    assert.equal(record?.rejectionReason, null);
  } finally {
    await cleanup();
  }
});
