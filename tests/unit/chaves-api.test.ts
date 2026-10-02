import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mock = vi.hoisted(() => ({
  chave: vi.fn(), atualizar: vi.fn(), conta: vi.fn(), getAdmin: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {
  chaveDeApi: { findUnique: mock.chave, update: mock.atualizar },
  adminIdentity: { findFirst: mock.conta },
} }));
vi.mock("@/lib/auth", () => ({
  getAdmin: mock.getAdmin,
  ehDaCasa: (role: string) => role === "OWNER" || role === "SOCIO",
}));
import {
  autenticarChave,
  ehEscopo,
  gerarChave,
  getAdminOuChave,
  hashDaChave,
  lerChaveDoCabecalho,
  motivoDeRecusa,
} from "@/lib/chaves-api";

function requisicao(authorization?: string) {
  return { headers: new Headers(authorization ? { authorization } : {}) } as unknown as NextRequest;
}

const dono = { id: "dono", nome: "Nicolas", email: "dono@example.invalid", role: "OWNER" };
const guardada = {
  id: "k1", nome: "Claude Code", prefixo: "avk_abcdefgh", hash: "h", criadaPor: "dono",
  escopos: ["projetos:ler", "projetos:escrever"], revogadaEm: null, expiraEm: null,
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("geração da chave", () => {
  it("o segredo tem prefixo reconhecível e o banco recebe só o hash", () => {
    const { segredo, prefixo, hash } = gerarChave();
    expect(segredo.startsWith("avk_")).toBe(true);
    expect(segredo.length).toBeGreaterThan(40);
    expect(prefixo).toBe(segredo.slice(0, 12));
    expect(hash).toBe(hashDaChave(segredo));
    expect(hash).not.toContain(segredo.slice(4));
  });

  it("duas chaves nunca saem iguais", () => {
    expect(gerarChave().segredo).not.toBe(gerarChave().segredo);
  });
});

describe("leitura do cabeçalho", () => {
  it("aceita só Bearer com o prefixo da casa", () => {
    expect(lerChaveDoCabecalho("Bearer avk_xyz")).toBe("avk_xyz");
    expect(lerChaveDoCabecalho("bearer avk_xyz")).toBe("avk_xyz");
    expect(lerChaveDoCabecalho("Bearer eyJhbGciOi")).toBeNull();
    expect(lerChaveDoCabecalho("Basic avk_xyz")).toBeNull();
    expect(lerChaveDoCabecalho(null)).toBeNull();
  });
});

describe("regras da chave", () => {
  it("recusa revogada, expirada e escopo que ela não tem", () => {
    const agora = new Date("2026-10-02T12:00:00Z");
    expect(motivoDeRecusa({ ...guardada, revogadaEm: agora }, "projetos:ler", agora)).toMatch(/revogada/);
    expect(motivoDeRecusa({ ...guardada, expiraEm: agora }, "projetos:ler", agora)).toMatch(/expirada/);
    expect(motivoDeRecusa(guardada, "marcas:escrever", agora)).toMatch(/marcas:escrever/);
    expect(motivoDeRecusa(guardada, "projetos:escrever", agora)).toBeNull();
  });

  it("escopo desconhecido não passa por escopo válido", () => {
    expect(ehEscopo("projetos:ler")).toBe(true);
    expect(ehEscopo("financeiro:escrever")).toBe(false);
    expect(ehEscopo("toString")).toBe(false);
  });
});

describe("autenticação", () => {
  it("chave válida age em nome de quem criou e registra o uso", async () => {
    mock.chave.mockResolvedValue(guardada);
    mock.conta.mockResolvedValue(dono);
    const resultado = await autenticarChave("avk_qualquer", "projetos:escrever");
    expect(resultado).toEqual({
      ok: true,
      admin: { ...dono, chave: { id: "k1", prefixo: "avk_abcdefgh", nome: "Claude Code" } },
    });
    expect(mock.chave).toHaveBeenCalledWith({ where: { hash: hashDaChave("avk_qualquer") } });
    expect(mock.atualizar).toHaveBeenCalledOnce();
  });

  it("conta dona desligada ou fora da casa leva a chave junto", async () => {
    mock.chave.mockResolvedValue(guardada);
    mock.conta.mockResolvedValue(null);
    expect((await autenticarChave("avk_x", "projetos:ler")).ok).toBe(false);

    mock.conta.mockResolvedValue({ ...dono, role: "CLIENT" });
    expect((await autenticarChave("avk_x", "projetos:ler")).ok).toBe(false);
    expect(mock.atualizar).not.toHaveBeenCalled();
  });

  it("chave inexistente é recusada sem tocar em conta", async () => {
    mock.chave.mockResolvedValue(null);
    expect(await autenticarChave("avk_x", "projetos:ler")).toEqual({ ok: false, erro: "Chave inválida." });
    expect(mock.conta).not.toHaveBeenCalled();
  });

  it("sem cabeçalho, vale a sessão de gente", async () => {
    mock.getAdmin.mockResolvedValue(dono);
    expect(await getAdminOuChave(requisicao(), "projetos:ler")).toEqual({ admin: dono });
  });

  it("com Bearer, vale só a chave — a sessão não salva chave ruim", async () => {
    mock.getAdmin.mockResolvedValue(dono);
    mock.chave.mockResolvedValue({ ...guardada, revogadaEm: new Date() });
    const resultado = await getAdminOuChave(requisicao("Bearer avk_revogada"), "projetos:ler");
    expect(resultado).toEqual({ admin: null, erro: "Chave revogada." });
    expect(mock.getAdmin).not.toHaveBeenCalled();
  });
});
