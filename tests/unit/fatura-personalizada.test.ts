import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ role: "OWNER", created: null as Record<string, unknown> | null, audited: 0 }))
vi.mock("@/lib/prisma", () => ({ prisma: {
  $transaction: async (operation: (tx: unknown) => unknown) => operation({
    adminIdentity: { findUnique: async () => ({ role: state.role }) },
    organization: { findUnique: async () => ({ id: "org-1" }) },
    subscriptionInvoice: { create: async ({ data }: { data: Record<string, unknown> }) => { state.created = data; return { id: "invoice-1", ...data } } },
    operationsAuditEvent: { create: async () => { state.audited++; return {} } },
  }),
} }))

import { criarFaturaPersonalizada } from "@/lib/fatura-personalizada"

const input = {
  organizationId: "org-1", description: "Consultoria", amountCents: 123456,
  competence: "2026-11", dueDate: new Date("2026-11-30T00:00:00Z"), currency: "BRL" as const,
  automaticNfse: true, fiscalServiceCode: "010701", fiscalDescription: "Consultoria em tecnologia",
}

describe("fatura personalizada", () => {
  beforeEach(() => { state.role = "OWNER"; state.created = null; state.audited = 0 })

  it("cria CUSTOM diretamente no cliente, sem assinatura técnica", async () => {
    const invoice = await criarFaturaPersonalizada(input, "owner-1")
    expect(invoice.id).toBe("invoice-1")
    expect(state.created).toMatchObject({ organizationId: "org-1", subscriptionId: null, kind: "CUSTOM", description: "Consultoria", currency: "BRL", automaticNfse: true })
    expect(String(state.created?.amount)).toBe("1234.56")
    expect(state.audited).toBe(1)
  })

  it("recusa não dono e emissão fiscal incompleta antes de criar", async () => {
    state.role = "SOCIO"
    await expect(criarFaturaPersonalizada(input, "member-1")).rejects.toThrow("Só o dono")
    state.role = "OWNER"
    await expect(criarFaturaPersonalizada({ ...input, fiscalServiceCode: null }, "owner-1")).rejects.toThrow("código e descrição")
    expect(state.created).toBeNull()
  })
})
