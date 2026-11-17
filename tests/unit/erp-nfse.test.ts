import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { confirmarNfseManualNoErp, emitirNfseNoErp, ErpNfseErro, prepararNfseManualNoErp } from "@/lib/erp-nfse";

describe("cliente TypeScript da NFS-e no ERP", () => {
  beforeEach(() => {
    process.env.ERP_NFSE_URL = "https://erp.avilaops.com";
    process.env.ERP_SERVICE_KEY = "erp_tenant_secret";
    process.env.ERP_TENANT_ID = "tenant-1";
  });
  afterEach(() => vi.restoreAllMocks());

  it("envia tenant, chave de serviço e idempotência apenas no servidor", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { id: "nfse-1", externalId: "invoice-1", status: "ISSUED", revision: 1 } }), { status: 201, headers: { "content-type": "application/json" } }));
    await emitirNfseNoErp({ idempotencyKey: "eaf02748-0d0c-4c4b-a8ab-a3797f94dbba", externalId: "invoice-1", competenceDate: "2026-11-01", amount: "1250.00", serviceCode: "010701", description: "Consultoria", customer: { name: "Cliente", taxId: "12345678901" } });
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ authorization: "Bearer erp_tenant_secret", "x-tenant-id": "tenant-1", "idempotency-key": "eaf02748-0d0c-4c4b-a8ab-a3797f94dbba" });
    expect(String(init?.body)).toContain('"environment":"homologation"');
  });

  it("aceita HTTP somente no hostname privado do ERP", async () => {
    process.env.ERP_NFSE_URL = "http://api:8081";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { id: "nfse-1", externalId: "invoice-1", status: "pending", revision: 1 } }), { status: 201, headers: { "content-type": "application/json" } }));

    await emitirNfseNoErp({ idempotencyKey: "eaf02748-0d0c-4c4b-a8ab-a3797f94dbba", externalId: "invoice-1", competenceDate: "2026-11-01", amount: "1250.00", serviceCode: "010701", description: "Consultoria", customer: { name: "Cliente", taxId: "12345678901" } });

    expect(fetchMock).toHaveBeenCalledWith("http://api:8081/api/v1/integrations/nfse/issuances", expect.any(Object));

    process.env.ERP_NFSE_URL = "http://example.com";
    await expect(emitirNfseNoErp({ idempotencyKey: "eaf02748-0d0c-4c4b-a8ab-a3797f94dbba", externalId: "invoice-2", competenceDate: "2026-11-01", amount: "1.00", serviceCode: "010701", description: "Consultoria", customer: { name: "Cliente", taxId: "12345678901" } })).rejects.toThrow("A URL do ERP deve usar HTTPS.");
  });

  it("marca resposta 5xx como incerta sem incluir a credencial no erro", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("indisponível", { status: 503 }));
    const error = await emitirNfseNoErp({ idempotencyKey: "eaf02748-0d0c-4c4b-a8ab-a3797f94dbba", externalId: "invoice-1", competenceDate: "2026-11-01", amount: "1.00", serviceCode: "010701", description: "Serviço", customer: { name: "Cliente", taxId: "12345678901" } }).catch((value) => value) as unknown as ErpNfseErro;
    expect(error).toBeInstanceOf(ErpNfseErro);
    expect(error.uncertain).toBe(true);
    expect(error.message).not.toContain("erp_tenant_secret");
  });

  it("preserva o título seguro retornado pelo contrato Problem do ERP", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      type: "fiscal_certificate_missing",
      title: "Certificado A1 não configurado",
      status: 409,
    }), { status: 409, headers: { "content-type": "application/problem+json" } }));

    await expect(emitirNfseNoErp({
      idempotencyKey: "eaf02748-0d0c-4c4b-a8ab-a3797f94dbba",
      externalId: "invoice-1",
      competenceDate: "2026-11-01",
      amount: "1.00",
      serviceCode: "010701",
      description: "Serviço",
      customer: { name: "Cliente", taxId: "12345678901" },
    })).rejects.toThrow("Certificado A1 não configurado");
  });

  it("prepara emissão manual em produção e confirma o XML sem certificado no app", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "nfse-1", externalId: "invoice-1", status: "pending", revision: 1 }, portalUrl: "https://www.nfse.gov.br/EmissorNacional" }), { status: 201, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "nfse-1", externalId: "invoice-1", status: "authorized", revision: 2, accessKey: "1".repeat(50) } }), { status: 200, headers: { "content-type": "application/json" } }));
    const prepared = await prepararNfseManualNoErp({ idempotencyKey: "eaf02748-0d0c-4c4b-a8ab-a3797f94dbba", externalId: "invoice-1", competenceDate: "2026-11-01", amount: "1250.00", serviceCode: "010701", description: "Consultoria", customer: { name: "Cliente", taxId: "12345678901" } });
    expect(prepared).toMatchObject({ status: "pending", portalUrl: "https://www.nfse.gov.br/EmissorNacional" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://erp.avilaops.com/api/v1/integrations/nfse/manual-issuances");
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain('"environment":"production"');
    await confirmarNfseManualNoErp("nfse-1", "baf02748-0d0c-4c4b-a8ab-a3797f94dbba", "<?xml version=\"1.0\"?><NFSe/>");
    expect(fetchMock.mock.calls[1][0]).toBe("https://erp.avilaops.com/api/v1/integrations/nfse/issuances/nfse-1/manual-confirm");
    expect(String(fetchMock.mock.calls[1][1]?.body)).toContain("<NFSe/>");
  });
});
