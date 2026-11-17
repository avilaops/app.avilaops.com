import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  emitir: vi.fn(),
  reconciliar: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: estado.queryRaw,
    subscriptionInvoice: { findUnique: estado.findUnique },
    nfseDispatch: { updateMany: estado.updateMany },
  },
}));

vi.mock("@/lib/erp-nfse", () => ({
  ErpNfseErro: class ErpNfseErro extends Error {
    constructor(message: string, readonly uncertain = false, readonly status?: number) { super(message); }
  },
  emitirNfseNoErp: estado.emitir,
  reconciliarNfseNoErp: estado.reconciliar,
}));

const { processarFilaNfse } = await import("@/lib/fila-nfse");
const AGORA = new Date("2026-11-20T12:05:00.000Z");

describe("processador da fila de NFS-e", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estado.queryRaw.mockResolvedValue([{
      id: "despacho-1",
      invoiceId: "fatura-1",
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
      attempts: 1,
      claimToken: "22222222-2222-4222-8222-222222222222",
      erpIssuanceId: null,
    }]);
    estado.findUnique.mockResolvedValue({
      id: "fatura-1",
      status: "PAID",
      competence: "2026-11",
      amount: { toFixed: () => "1250.00" },
      fiscalServiceCode: "010701",
      fiscalDescription: "Consultoria em tecnologia",
      organization: {
        name: "Cliente",
        legalName: "Cliente LTDA",
        cpfCnpj: "12345678000195",
        contacts: [{ email: "financeiro@cliente.test" }],
      },
    });
    estado.updateMany.mockResolvedValue({ count: 1 });
  });

  it("conclui o despacho quando o ERP autoriza a NFS-e", async () => {
    estado.emitir.mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333",
      externalId: "fatura-1",
      status: "authorized",
      revision: "2",
      accessKey: "chave-autorizada",
      reason: "Autorizada",
    });

    await expect(processarFilaNfse(AGORA, 20)).resolves.toEqual({
      claimed: 1,
      issued: 1,
      pending: 0,
      uncertain: 0,
      failed: 0,
    });
    expect(estado.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "ISSUED",
        erpStatus: "authorized",
        accessKey: "chave-autorizada",
        nextAttemptAt: null,
      }),
    }));
  });

  it("encerra sem repetição quando o ERP rejeita a NFS-e", async () => {
    estado.emitir.mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333",
      externalId: "fatura-1",
      status: "rejected",
      revision: "2",
      reason: "Código de serviço inválido",
    });

    await expect(processarFilaNfse(AGORA, 20)).resolves.toEqual({
      claimed: 1,
      issued: 0,
      pending: 0,
      uncertain: 0,
      failed: 1,
    });
    expect(estado.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "FAILED",
        erpStatus: "rejected",
        nextAttemptAt: null,
        lastError: "Código de serviço inválido",
      }),
    }));
  });

  it("agenda reconciliação quando o ERP não confirma a transmissão", async () => {
    estado.emitir.mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333",
      externalId: "fatura-1",
      status: "uncertain",
      revision: "2",
      reason: "Operação fiscal não confirmada",
    });

    await expect(processarFilaNfse(AGORA, 20)).resolves.toEqual({
      claimed: 1,
      issued: 0,
      pending: 0,
      uncertain: 1,
      failed: 0,
    });
    expect(estado.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "UNCERTAIN",
        erpStatus: "uncertain",
        nextAttemptAt: new Date("2026-11-20T12:10:00.000Z"),
      }),
    }));
  });
});
