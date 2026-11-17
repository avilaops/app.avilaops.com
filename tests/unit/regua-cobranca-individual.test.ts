import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  invoice: { id: "fatura-1", organizationId: "org-1", status: "OPEN" },
  dispatch: {
    id: "lembrete-1",
    invoiceId: "fatura-1",
    stage: "CUSTOM:teste",
    content: "ambos",
    status: "PENDING",
    scheduledFor: new Date("2026-11-21T12:00:00.000Z"),
    invoice: { organizationId: "org-1", status: "OPEN" },
  },
  created: null as Record<string, unknown> | null,
  updated: null as Record<string, unknown> | null,
  audited: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (operation: (tx: unknown) => unknown) => operation({
      subscriptionInvoice: { findUnique: async () => estado.invoice },
      billingEmailDispatch: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          estado.created = data;
          return { id: "lembrete-novo", ...data };
        },
        findFirst: async ({ where }: { where: { stage?: { startsWith?: string }; status?: string } }) => {
          if (where.stage?.startsWith && !estado.dispatch.stage.startsWith(where.stage.startsWith)) return null;
          if (where.status && estado.dispatch.status !== where.status) return null;
          return estado.dispatch;
        },
        update: async ({ data }: { data: Record<string, unknown> }) => {
          estado.updated = data;
          const defined = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
          return { ...estado.dispatch, ...defined };
        },
      },
      operationsAuditEvent: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          estado.audited.push(data);
          return {};
        },
      },
    }),
  },
}));

const {
  alterarLembreteIndividual,
  cancelarLembreteIndividual,
  criarLembreteIndividual,
} = await import("@/lib/regua-cobranca-individual");

const AGORA = new Date("2026-11-20T12:00:00.000Z");

describe("régua individual de cobrança", () => {
  beforeEach(() => {
    estado.invoice = { id: "fatura-1", organizationId: "org-1", status: "OPEN" };
    estado.dispatch = {
      id: "lembrete-1",
      invoiceId: "fatura-1",
      stage: "CUSTOM:teste",
      content: "ambos",
      status: "PENDING",
      scheduledFor: new Date("2026-11-21T12:00:00.000Z"),
      invoice: { organizationId: "org-1", status: "OPEN" },
    };
    estado.created = null;
    estado.updated = null;
    estado.audited = [];
  });

  it("cria lembrete personalizado futuro e registra auditoria", async () => {
    const scheduledFor = new Date("2026-11-22T15:00:00.000Z");
    await criarLembreteIndividual({ invoiceId: "fatura-1", scheduledFor, content: "fatura", actorId: "owner-1" }, AGORA);

    expect(estado.created).toMatchObject({ invoiceId: "fatura-1", scheduledFor, content: "fatura" });
    expect(String(estado.created?.stage)).toMatch(/^CUSTOM:/);
    expect(estado.audited).toContainEqual(expect.objectContaining({ action: "COBRANCA_LEMBRETE_CRIADO", actorId: "owner-1", organizationId: "org-1" }));
  });

  it("altera e restaura somente lembrete personalizado pendente ou cancelado", async () => {
    const scheduledFor = new Date("2026-11-23T15:00:00.000Z");
    await alterarLembreteIndividual({ invoiceId: "fatura-1", dispatchId: "lembrete-1", scheduledFor, content: "cobranca", actorId: "owner-1" }, AGORA);
    expect(estado.updated).toMatchObject({ scheduledFor, content: "cobranca" });
    expect(estado.audited.at(-1)).toMatchObject({ action: "COBRANCA_LEMBRETE_ALTERADO" });

    estado.dispatch.status = "CANCELLED";
    await alterarLembreteIndividual({ invoiceId: "fatura-1", dispatchId: "lembrete-1", restore: true, actorId: "owner-1" }, AGORA);
    expect(estado.updated).toMatchObject({ status: "PENDING", cancelledAt: null, lastError: null });
    expect(estado.audited.at(-1)).toMatchObject({ action: "COBRANCA_LEMBRETE_RESTAURADO" });
  });

  it("cancela atomicamente apenas lembrete CUSTOM pendente e registra auditoria", async () => {
    await cancelarLembreteIndividual({ invoiceId: "fatura-1", dispatchId: "lembrete-1", actorId: "owner-1" }, AGORA);

    expect(estado.updated).toMatchObject({ status: "CANCELLED", cancelledAt: AGORA });
    expect(estado.audited).toContainEqual(expect.objectContaining({
      action: "COBRANCA_LEMBRETE_CANCELADO",
      actorId: "owner-1",
      organizationId: "org-1",
      entityId: "lembrete-1",
    }));

    estado.dispatch.stage = "DUE";
    await expect(cancelarLembreteIndividual({ invoiceId: "fatura-1", dispatchId: "lembrete-1", actorId: "owner-1" }, AGORA))
      .rejects.toThrow("Lembrete personalizado não encontrado");
  });
});
