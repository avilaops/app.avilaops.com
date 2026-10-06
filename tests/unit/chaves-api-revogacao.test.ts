import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  admin: vi.fn(), origem: vi.fn(), chave: vi.fn(), reivindicar: vi.fn(),
  auditar: vi.fn(), transacao: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  getAdmin: mock.admin, ehDono: (role: string) => role === "OWNER",
}));
vi.mock("@/lib/http", () => ({ origemEstrita: mock.origem }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  chaveDeApi: { findUnique: mock.chave },
  $transaction: mock.transacao,
} }));
import { DELETE } from "@/app/api/chaves-api/[id]/route";

const pedido = () => new NextRequest("http://localhost:3000/api/chaves-api/k1", { method: "DELETE" });
const contexto = () => ({ params: Promise.resolve({ id: "k1" }) });

beforeEach(() => {
  vi.resetAllMocks();
  mock.admin.mockResolvedValue({ id: "dono", role: "OWNER" });
  mock.origem.mockReturnValue(true);
  mock.chave.mockResolvedValue({ id: "k1", prefixo: "avk_teste", revogadaEm: null });
  mock.reivindicar.mockResolvedValue({ count: 1 });
  mock.auditar.mockResolvedValue({});
  mock.transacao.mockImplementation(async (operacao) => operacao({
    chaveDeApi: { updateMany: mock.reivindicar },
    operationsAuditEvent: { create: mock.auditar },
  }));
});

describe("revogação de chave de API", () => {
  it("reivindica apenas a linha ativa e audita na mesma transação", async () => {
    const resposta = await DELETE(pedido(), contexto());
    expect(await resposta.json()).toEqual({ ok: true });
    expect(mock.reivindicar).toHaveBeenCalledWith({
      where: { id: "k1", revogadaEm: null }, data: { revogadaEm: expect.any(Date) },
    });
    expect(mock.auditar).toHaveBeenCalledExactlyOnceWith({ data: {
      actorId: "dono", action: "API_KEY_REVOKED", entityType: "ChaveDeApi",
      entityId: "k1", metadata: { prefixo: "avk_teste" },
    } });
  });

  it("se outra requisição ganhou depois da leitura, responde idempotente sem auditar", async () => {
    mock.reivindicar.mockResolvedValue({ count: 0 });
    expect(await (await DELETE(pedido(), contexto())).json()).toEqual({ ok: true, jaRevogada: true });
    expect(mock.auditar).not.toHaveBeenCalled();
  });

  it("chave já revogada não abre uma nova transação", async () => {
    mock.chave.mockResolvedValue({ id: "k1", prefixo: "avk_teste", revogadaEm: new Date() });
    expect(await (await DELETE(pedido(), contexto())).json()).toEqual({ ok: true, jaRevogada: true });
    expect(mock.transacao).not.toHaveBeenCalled();
  });

  it("chave inexistente responde 404", async () => {
    mock.chave.mockResolvedValue(null);
    expect((await DELETE(pedido(), contexto())).status).toBe(404);
    expect(mock.transacao).not.toHaveBeenCalled();
  });

  it("falha da auditoria rejeita a transação, sem responder sucesso", async () => {
    mock.auditar.mockRejectedValue(new Error("auditoria indisponível"));
    await expect(DELETE(pedido(), contexto())).rejects.toThrow("auditoria indisponível");
  });

  it("sessão sem papel de dono é recusada antes de consultar a chave", async () => {
    mock.admin.mockResolvedValue({ id: "socio", role: "SOCIO" });
    expect((await DELETE(pedido(), contexto())).status).toBe(401);
    expect(mock.chave).not.toHaveBeenCalled();
  });

  it("origem inválida é recusada antes de consultar a chave", async () => {
    mock.origem.mockReturnValue(false);
    expect((await DELETE(pedido(), contexto())).status).toBe(403);
    expect(mock.chave).not.toHaveBeenCalled();
  });
});
