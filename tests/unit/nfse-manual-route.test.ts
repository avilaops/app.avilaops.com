import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  findInvoice: vi.fn(), findDispatch: vi.fn(), schedule: vi.fn(), prepare: vi.fn(), confirm: vi.fn(),
  update: vi.fn(), audit: vi.fn(), transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getAdmin: vi.fn().mockResolvedValue({ id: "owner-1", role: "OWNER" }), ehDono: vi.fn().mockReturnValue(true) }));
vi.mock("@/lib/http", () => ({ sameOrigin: vi.fn().mockReturnValue(true) }));
vi.mock("@/lib/fila-nfse", () => ({ reservarEmissaoManual: state.schedule }));
vi.mock("@/lib/erp-nfse", () => ({ prepararNfseManualNoErp: state.prepare, confirmarNfseManualNoErp: state.confirm, baixarXmlNfseDoErp: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  subscriptionInvoice: { findUnique: state.findInvoice },
  nfseDispatch: { findUnique: state.findDispatch, update: state.update },
  operationsAuditEvent: { create: state.audit },
  $transaction: state.transaction,
} }));

const { POST, PUT } = await import("@/app/api/billing/faturas/[id]/nfse/route");
const context = { params: Promise.resolve({ id: "invoice-1" }) };

describe("emissão manual de NFS-e pelo Gov.br", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.findInvoice.mockResolvedValue({ id: "invoice-1", organizationId: "org-1", status: "PAID", competence: "2026-11", amount: { toFixed: () => "1250.00" }, fiscalServiceCode: "010701", fiscalDescription: "Consultoria", organization: { name: "Cliente", legalName: "Cliente LTDA", cpfCnpj: "12345678000195", contacts: [{ email: "financeiro@cliente.test" }] } });
    state.schedule.mockResolvedValue({ id: "dispatch-1", idempotencyKey: "11111111-1111-4111-8111-111111111111" });
    state.prepare.mockResolvedValue({ id: "erp-1", status: "pending", reason: "Emita no portal", portalUrl: "https://www.nfse.gov.br/EmissorNacional" });
    state.findDispatch.mockResolvedValue({ id: "dispatch-1", invoiceId: "invoice-1", status: "PENDING", erpStatus: "pending", erpIssuanceId: "erp-1", invoice: { organizationId: "org-1" } });
    state.confirm.mockResolvedValue({ id: "erp-1", status: "authorized", accessKey: "1".repeat(50), reason: "Validada" });
    state.transaction.mockResolvedValue([]);
  });

  it("prepara a nota no ERP sem chamar a fila automática", async () => {
    const response = await POST(new NextRequest("https://app.avilaops.com/api/billing/faturas/invoice-1/nfse", { method: "POST", headers: { origin: "https://app.avilaops.com" } }), context);
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ portalUrl: "https://www.nfse.gov.br/EmissorNacional" });
    expect(state.prepare).toHaveBeenCalledWith(expect.objectContaining({ externalId: "invoice-1", amount: "1250.00", customer: expect.objectContaining({ taxId: "12345678000195" }) }));
    expect(state.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PENDING", issuanceMode: "MANUAL", erpIssuanceId: "erp-1", erpStatus: "pending", nextAttemptAt: null }) }));
    expect(state.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "NFSE_MANUAL_PREPARADA" }) }));
  });

  it("envia o XML ao ERP e registra a autorização com auditoria", async () => {
    const form = new FormData();
    form.set("xml", new File(["<?xml version=\"1.0\"?><NFSe/>"], "nfse.xml", { type: "application/xml" }));
    const response = await PUT(new NextRequest("https://app.avilaops.com/api/billing/faturas/invoice-1/nfse", { method: "PUT", headers: { origin: "https://app.avilaops.com" }, body: form }), context);
    expect(response.status).toBe(200);
    expect(state.confirm).toHaveBeenCalledWith("erp-1", expect.any(String), "<?xml version=\"1.0\"?><NFSe/>");
    expect(state.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "ISSUED", erpStatus: "authorized", accessKey: "1".repeat(50) }) }));
    expect(state.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "NFSE_MANUAL_CONFIRMADA" }) }));
  });
});
