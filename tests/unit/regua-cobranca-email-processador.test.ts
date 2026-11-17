import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  updateMany: vi.fn(),
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  auditCreate: vi.fn(),
  enviar: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscriptionInvoice: { findMany: estado.findMany, findUnique: estado.findUnique },
    billingEmailDispatch: { upsert: estado.upsert, updateMany: estado.updateMany },
    operationsAuditEvent: { create: estado.auditCreate },
    $transaction: estado.transaction,
    $queryRaw: estado.queryRaw,
  },
}));

vi.mock("@/lib/entrega-cobranca", () => ({
  enviarCobrancaPorEmail: estado.enviar,
}));

const { processarReguaDeCobranca } = await import("@/lib/regua-cobranca-email");
const AGORA = new Date("2026-11-20T12:05:00.000Z");

describe("processador da régua de cobrança", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estado.findMany.mockResolvedValue([{ id: "fatura-1", dueDate: new Date("2026-11-20T00:00:00.000Z") }]);
    estado.upsert.mockResolvedValue({});
    estado.transaction.mockResolvedValue([]);
    estado.updateMany.mockResolvedValue({ count: 0 });
    estado.queryRaw.mockResolvedValue([
      { id: "envio-1", invoiceId: "fatura-1", stage: "DUE", attempts: 1, claimToken: "claim-1" },
    ]);
    estado.findUnique.mockResolvedValue({ status: "OPEN", subscription: { organizationId: "org-1" } });
    estado.auditCreate.mockResolvedValue({ id: 41n });
    estado.enviar.mockResolvedValue({
      enviado: true,
      destino: "financeiro@cliente.test",
      organizationId: "org-1",
      invoiceId: "fatura-1",
      chargeId: "cobranca-1",
    });
  });

  it("reconcilia, reivindica e envia D0 com fatura e cobrança", async () => {
    await expect(processarReguaDeCobranca(AGORA, 20)).resolves.toEqual({
      reconciliados: 3,
      reivindicados: 1,
      enviados: 1,
      repeticoes: 0,
      falhas: 0,
      cancelados: 0,
      ignorados: 0,
    });
    expect(estado.enviar).toHaveBeenCalledWith({ tipo: "fatura", id: "fatura-1" }, { conteudo: "ambos" });
    expect(estado.auditCreate).toHaveBeenCalledTimes(2);
  });

  it("cancela o item se a fatura foi paga depois da reivindicação", async () => {
    estado.findUnique.mockResolvedValue({ status: "PAID", subscription: { organizationId: "org-1" } });
    const resumo = await processarReguaDeCobranca(AGORA);
    expect(resumo.cancelados).toBe(1);
    expect(estado.enviar).not.toHaveBeenCalled();
  });

  it("agenda só uma repetição quando o provedor falha", async () => {
    estado.enviar.mockResolvedValue({
      enviado: false,
      destino: "financeiro@cliente.test",
      organizationId: "org-1",
      invoiceId: "fatura-1",
      chargeId: "cobranca-1",
    });
    const resumo = await processarReguaDeCobranca(AGORA);
    expect(resumo.repeticoes).toBe(1);
    expect(estado.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "PENDING", nextAttemptAt: new Date("2026-11-20T12:35:00.000Z") }),
    }));
  });
});
