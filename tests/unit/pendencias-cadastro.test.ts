import { describe, expect, it } from "vitest";
import { pendenciasDoCadastro } from "@/lib/pendencias-cadastro";

describe("pendências do cadastro do cliente", () => {
  it("cliente recém-criado só com CNPJ não está em dia", () => {
    expect(
      pendenciasDoCadastro({
        cpfCnpj: "34245861000151",
        segment: null,
        contacts: [],
        webPresence: { hasCurrentSite: true, primaryDomain: null },
      }),
    ).toEqual(["contato principal", "e-mail ou telefone", "segmento", "domínio"]);
  });

  it("cadastro completo não tem pendência", () => {
    expect(
      pendenciasDoCadastro({
        cpfCnpj: "34245861000151",
        segment: "Indústria e manutenção",
        contacts: [{ name: "Fulano", whatsapp: "11999999999" }],
        webPresence: { hasCurrentSite: true, primaryDomain: "pkvedacoes.com.br" },
      }),
    ).toEqual([]);
  });

  it("sem site atual não cobra domínio", () => {
    expect(
      pendenciasDoCadastro({
        cpfCnpj: "34245861000151",
        segment: "Outro",
        contacts: [{ name: "Fulano", email: "a@b.com" }],
        webPresence: { hasCurrentSite: false, primaryDomain: null },
      }),
    ).toEqual([]);
  });
});

describe("pendências: dados que a ficha em PDF grava no perfil", () => {
  it("e-mail e telefone do perfil contam como canal de contato", () => {
    expect(
      pendenciasDoCadastro({
        cpfCnpj: "34245861000151",
        segment: "Outro",
        contacts: [],
        profile: { ownerName: "Fulano", email: "a@b.com", phone: null, whatsapp: null },
        webPresence: { hasCurrentSite: false, primaryDomain: null },
      }),
    ).toEqual([]);
  });
});
