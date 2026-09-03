import { describe, expect, it, vi } from "vitest";

// A escolha é pura; o módulo carrega o Prisma no topo.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { escolherParaRecuperacao } = await import("@/lib/auth");

// As três contas que compartilham nicolasrosaab@gmail.com em produção.
const CONTAS = [
  { email: "news@avilaops.com", role: "CLIENT" },
  { email: "nicolas@avilaops.com", role: "OWNER" },
  { email: "pix@avilaops.com", role: "CLIENT" },
];

describe("para qual conta vai o link de recuperação", () => {
  it("quem digita o próprio endereço recupera aquela conta", () => {
    for (const c of CONTAS) {
      expect(escolherParaRecuperacao(CONTAS, c.email)?.email).toBe(c.email);
    }
  });

  it("digitar o e-mail de recuperação leva à conta de papel mais alto", () => {
    expect(escolherParaRecuperacao(CONTAS, "nicolasrosaab@gmail.com")?.email).toBe(
      "nicolas@avilaops.com",
    );
  });

  // Sem isto, `findFirst` sem ordem devolvia qualquer uma das três: hoje a
  // certa por sorte do plano de consulta, amanhã outra depois de um VACUUM.
  it("a escolha não depende da ordem em que as contas chegaram", () => {
    const baralhadas = [...CONTAS].reverse();
    expect(escolherParaRecuperacao(baralhadas, "nicolasrosaab@gmail.com")?.email).toBe(
      "nicolas@avilaops.com",
    );
  });

  it("entre contas do mesmo papel, o e-mail desempata", () => {
    const soClients = CONTAS.filter((c) => c.role === "CLIENT");
    expect(escolherParaRecuperacao(soClients, "nicolasrosaab@gmail.com")?.email).toBe(
      "news@avilaops.com",
    );
  });

  it("maiúsculas no que foi digitado não mudam o resultado", () => {
    expect(escolherParaRecuperacao(CONTAS, "PIX@AvilaOps.com")?.email).toBe("pix@avilaops.com");
  });

  it("sem candidata, não escolhe nada", () => {
    expect(escolherParaRecuperacao([], "qualquer@exemplo.com")).toBeNull();
  });
});
