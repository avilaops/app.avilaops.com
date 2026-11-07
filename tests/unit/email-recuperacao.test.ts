import { beforeEach, describe, expect, it, vi } from "vitest";

// A lista de domínios hospedados vem do banco; aqui ela é fixa, para o teste
// falar só da regra.
const consulta = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    get $queryRaw() {
      return consulta;
    },
  },
}));

const { validarEmailRecuperacao, EmailRecuperacaoInvalido } = await import("@/lib/email-recuperacao");

describe("e-mail de recuperação", () => {
  beforeEach(() => {
    consulta.mockReset();
    consulta.mockResolvedValue([
      { fqdn: "brilhax.com" },
      { fqdn: "cifrainssdeobras.com.br" },
      { fqdn: "comandeiro.com.br" },
    ]);
  });

  it("aceita um endereço de provedor de fora", async () => {
    await expect(validarEmailRecuperacao("dono@gmail.com", "ecommerce@brilhax.com")).resolves.toBe(
      "dono@gmail.com",
    );
  });

  it("normaliza espaço e maiúscula", async () => {
    await expect(validarEmailRecuperacao("  Dono@Gmail.COM ", "x@y.com")).resolves.toBe("dono@gmail.com");
  });

  // O caso que motivou tudo isto: a caixa profissional é a que a pessoa perde
  // o acesso, então não pode ser o caminho de volta.
  it("recusa domínio de cliente que a casa hospeda", async () => {
    await expect(
      validarEmailRecuperacao("contato@brilhax.com", "ecommerce@brilhax.com"),
    ).rejects.toBeInstanceOf(EmailRecuperacaoInvalido);
  });

  it("recusa domínio da própria casa mesmo sem caixa criada", async () => {
    consulta.mockResolvedValue([]);
    await expect(validarEmailRecuperacao("eu@avilaops.com", "x@y.com")).rejects.toBeInstanceOf(
      EmailRecuperacaoInvalido,
    );
    await expect(validarEmailRecuperacao("eu@avila.inc", "x@y.com")).rejects.toBeInstanceOf(
      EmailRecuperacaoInvalido,
    );
  });

  it("recusa o mesmo endereço do login (não seria recuperação nenhuma)", async () => {
    await expect(validarEmailRecuperacao("dono@gmail.com", "dono@gmail.com")).rejects.toBeInstanceOf(
      EmailRecuperacaoInvalido,
    );
  });

  it("aceita e-mail secundário ausente, sem consultar os domínios", async () => {
    for (const valor of ["", "   ", undefined, null]) {
      await expect(validarEmailRecuperacao(valor, "x@y.com")).resolves.toBeNull();
    }
    expect(consulta).not.toHaveBeenCalled();
  });

  it("recusa formato inválido quando informado", async () => {
    for (const valor of ["sem-arroba", "a@b", 42]) {
      await expect(validarEmailRecuperacao(valor, "x@y.com")).rejects.toBeInstanceOf(
        EmailRecuperacaoInvalido,
      );
    }
  });

  it("o motivo diz qual domínio foi recusado", async () => {
    await expect(
      validarEmailRecuperacao("contato@brilhax.com", "x@y.com"),
    ).rejects.toThrow(/brilhax\.com/);
  });
});
