import { beforeEach, describe, expect, it, vi } from "vitest";

const buscarPorZona = vi.fn();
const buscarExistente = vi.fn();
const atualizarDominio = vi.fn();
const criarOuAtualizarDominio = vi.fn();
const criarOuAtualizarOrganizacao = vi.fn();
const removerRegistrosAusentes = vi.fn();
const criarEvento = vi.fn();

vi.mock("@/lib/cloudflare", () => ({
  listZones: vi.fn().mockResolvedValue([
    {
      id: "zone-1",
      name: "vedashow.com.br",
      status: "active",
      plan: { name: "Free Website" },
    },
  ]),
  listDnsRecords: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    domainAsset: {
      get findUnique() {
        return buscarPorZona;
      },
      get findFirst() {
        return buscarExistente;
      },
      get update() {
        return atualizarDominio;
      },
      get upsert() {
        return criarOuAtualizarDominio;
      },
    },
    organization: {
      get upsert() {
        return criarOuAtualizarOrganizacao;
      },
    },
    dnsRecord: {
      upsert: vi.fn(),
      get deleteMany() {
        return removerRegistrosAusentes;
      },
    },
    operationsAuditEvent: {
      get create() {
        return criarEvento;
      },
    },
  },
}));

const { syncCloudflareDomains } = await import("@/lib/domain-sync");

describe("syncCloudflareDomains", () => {
  beforeEach(() => {
    buscarPorZona.mockReset().mockResolvedValue(null);
    buscarExistente.mockReset().mockImplementation(({ where }) =>
      where.OR
        ? Promise.resolve({ id: "domain-1", organizationId: "org-1" })
        : Promise.resolve({ organizationId: "org-1" }),
    );
    atualizarDominio.mockReset().mockResolvedValue({ id: "domain-1", organizationId: "org-1" });
    criarOuAtualizarDominio
      .mockReset()
      .mockRejectedValue(new Error("Unique constraint failed on the fields: (`fqdn`)"));
    criarOuAtualizarOrganizacao.mockReset();
    removerRegistrosAusentes.mockReset().mockResolvedValue({ count: 0 });
    criarEvento.mockReset().mockResolvedValue({});
  });

  it("vincula a zona ao domínio que já existe pelo FQDN", async () => {
    const resultado = await syncCloudflareDomains("owner-1");

    expect(resultado).toEqual([
      {
        domain: "vedashow.com.br",
        organizationId: "org-1",
        domainAssetId: "domain-1",
        dnsRecordCount: 0,
      },
    ]);
    expect(atualizarDominio).toHaveBeenCalledWith({
      where: { id: "domain-1" },
      data: expect.objectContaining({
        cloudflareZoneId: "zone-1",
        cloudflarePlan: "Free Website",
        cloudflareStatus: "active",
      }),
    });
    expect(criarOuAtualizarDominio).not.toHaveBeenCalled();
    expect(criarOuAtualizarOrganizacao).not.toHaveBeenCalled();
  });
});
