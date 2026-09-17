import { describe, expect, it } from "vitest";
import { CAMPOS_CADASTRO, CAMPOS_DA_IA, campoPorChave, cortarNoTamanho } from "@/lib/cadastro-ia/campos";
import { analisarCadastro, valorAtual, type RetratoCadastro } from "@/lib/cadastro-ia/lacunas";
import { sugestoesDaReceita } from "@/lib/cadastro-ia/receita";
import {
  MAXIMO_SUGESTOES,
  filtrarSugestoes,
  montarContexto,
  pareceDadoVerificavel,
} from "@/lib/cadastro-ia/sugestoes";

function retrato(parcial: Partial<RetratoCadastro> = {}): RetratoCadastro {
  return {
    organization: { name: "Topografia Vale", legalName: null, segment: null, siteUrl: null, cnpjData: null },
    profile: null,
    webPresence: null,
    ...parcial,
  };
}

describe("registro de campos", () => {
  it("nunca deixa a IA propor dado verificável", () => {
    const proibidos = [
      "legalName",
      "phone",
      "email",
      "responsibleCpf",
      "stateRegistration",
      "postalCode",
      "street",
      "number",
      "district",
      "city",
      "state",
    ];

    for (const chave of proibidos) {
      expect(campoPorChave(chave)?.origens).not.toContain("IA");
    }
  });

  it("não tem chave repetida", () => {
    const chaves = CAMPOS_CADASTRO.map((campo) => campo.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("declara ao menos uma origem para todo campo", () => {
    for (const campo of CAMPOS_CADASTRO) {
      expect(campo.origens.length).toBeGreaterThan(0);
    }
  });
});

describe("análise de lacunas", () => {
  it("conta cadastro vazio como 0% e aponta todos os campos", () => {
    const analise = analisarCadastro(retrato());
    expect(analise.completude).toBe(0);
    expect(analise.lacunas).toHaveLength(CAMPOS_CADASTRO.length);
    expect(analise.preenchiveisPelaIa).toBe(CAMPOS_DA_IA.length);
  });

  it("ignora campo preenchido só de espaço", () => {
    const analise = analisarCadastro(
      retrato({ organization: { name: "X", legalName: "   ", segment: null, siteUrl: null, cnpjData: null } }),
    );
    expect(analise.lacunas.some((lacuna) => lacuna.chave === "legalName")).toBe(true);
  });

  it("tira da lista o campo que tem valor", () => {
    const analise = analisarCadastro(
      retrato({
        organization: { name: "X", legalName: "Vale Topografia LTDA", segment: null, siteUrl: null, cnpjData: null },
      }),
    );
    expect(analise.lacunas.some((lacuna) => lacuna.chave === "legalName")).toBe(false);
    expect(analise.preenchidos).toBe(1);
  });

  it("separa o que só o cliente responde do que a automação alcança", () => {
    const analise = analisarCadastro(retrato());
    const soma = analise.lacunas.filter(
      (lacuna) => lacuna.origens.includes("RECEITA_FEDERAL") || lacuna.origens.includes("IA"),
    ).length;
    expect(soma + analise.somenteComOCliente).toBe(analise.lacunas.length);
  });

  it("lê o valor do destino correto de cada campo", () => {
    const atual = retrato({ profile: { city: "Uberlândia" }, webPresence: { instagramHandle: "@vale" } });
    expect(valorAtual(atual, campoPorChave("city")!)).toBe("Uberlândia");
    expect(valorAtual(atual, campoPorChave("instagramHandle")!)).toBe("@vale");
    expect(valorAtual(atual, campoPorChave("companyDescription")!)).toBeNull();
  });
});

describe("preenchimento pela Receita Federal", () => {
  const cnpjData = {
    razao_social: "VALE TOPOGRAFIA E PROJETOS LTDA",
    cnae_fiscal_descricao: "Serviços de agrimensura",
    email: "CONTATO@VALETOPO.COM.BR",
    cep: "38400100",
    descricao_tipo_de_logradouro: "RUA",
    logradouro: "DAS ACACIAS",
    numero: "120",
    bairro: "CENTRO",
    municipio: "UBERLANDIA",
    uf: "MG",
    ddd_telefone_1: "3432221100",
  };

  it("propõe os campos oficiais formatados", () => {
    const sugestoes = sugestoesDaReceita(retrato({ organization: { name: "Vale", legalName: null, segment: null, siteUrl: null, cnpjData } }));
    const porCampo = Object.fromEntries(sugestoes.map((s) => [s.campo, s.valor]));

    expect(porCampo.legalName).toBe("VALE TOPOGRAFIA E PROJETOS LTDA");
    expect(porCampo.postalCode).toBe("38400-100");
    expect(porCampo.phone).toBe("(34) 3222-1100");
    expect(porCampo.street).toBe("RUA DAS ACACIAS");
    expect(porCampo.email).toBe("contato@valetopo.com.br");
    expect(sugestoes.every((s) => s.origem === "RECEITA_FEDERAL")).toBe(true);
  });

  it("não repete o tipo de logradouro quando ele já vem junto", () => {
    const sugestoes = sugestoesDaReceita(
      retrato({
        organization: {
          name: "Vale",
          legalName: null,
          segment: null,
          siteUrl: null,
          cnpjData: { ...cnpjData, logradouro: "RUA DAS ACACIAS" },
        },
      }),
    );
    expect(sugestoes.find((s) => s.campo === "street")?.valor).toBe("RUA DAS ACACIAS");
  });

  it("não propõe campo que já tem valor", () => {
    const sugestoes = sugestoesDaReceita(
      retrato({
        organization: { name: "Vale", legalName: "Já preenchido", segment: null, siteUrl: null, cnpjData },
        profile: { city: "Uberlândia" },
      }),
    );
    expect(sugestoes.some((s) => s.campo === "legalName")).toBe(false);
    expect(sugestoes.some((s) => s.campo === "city")).toBe(false);
  });

  it("devolve vazio sem consulta de CNPJ guardada", () => {
    expect(sugestoesDaReceita(retrato())).toEqual([]);
  });
});

describe("detecção de dado verificável em texto", () => {
  it("reprova telefone, CNPJ e CEP mesmo com separador", () => {
    expect(pareceDadoVerificavel("Ligue (34) 3222-1100")).toBe(true);
    expect(pareceDadoVerificavel("CNPJ 12.345.678/0001-90")).toBe(true);
    expect(pareceDadoVerificavel("CEP 38400-100")).toBe(true);
  });

  it("aceita texto comercial com anos e números soltos", () => {
    expect(pareceDadoVerificavel("Atua desde 2010 na região.")).toBe(false);
    expect(pareceDadoVerificavel("Equipe de 12 profissionais.")).toBe(false);
  });
});

describe("filtro das sugestões da IA", () => {
  const base = { confianca: "ALTA", justificativa: "Deduzido do CNAE." };

  it("recusa campo que a IA não pode propor", () => {
    const aceitas = filtrarSugestoes(
      [{ ...base, campo: "phone", valor: "Telefone comercial da empresa" }],
      retrato(),
    );
    expect(aceitas).toEqual([]);
  });

  it("recusa campo inexistente", () => {
    const aceitas = filtrarSugestoes(
      [{ ...base, campo: "faturamentoAnual", valor: "Texto plausível o suficiente" }],
      retrato(),
    );
    expect(aceitas).toEqual([]);
  });

  it("recusa campo que já está preenchido", () => {
    const aceitas = filtrarSugestoes(
      [{ ...base, campo: "companyDescription", valor: "Descrição nova e completa" }],
      retrato({ profile: { companyDescription: "Descrição escrita pela equipe" } }),
    );
    expect(aceitas).toEqual([]);
  });

  it("recusa texto curto demais para revisar", () => {
    const aceitas = filtrarSugestoes([{ ...base, campo: "segment", valor: "Topografia" }], retrato());
    expect(aceitas).toEqual([]);
  });

  it("recusa texto com dado verificável inventado", () => {
    const aceitas = filtrarSugestoes(
      [{ ...base, campo: "companyDescription", valor: "Atende pelo telefone (34) 3222-1100." }],
      retrato(),
    );
    expect(aceitas).toEqual([]);
  });

  it("mantém só a primeira proposta de cada campo", () => {
    const aceitas = filtrarSugestoes(
      [
        { ...base, campo: "companyDescription", valor: "Primeira redação da empresa." },
        { ...base, campo: "companyDescription", valor: "Segunda redação da empresa." },
      ],
      retrato(),
    );
    expect(aceitas).toHaveLength(1);
    expect(aceitas[0].valor).toBe("Primeira redação da empresa.");
  });

  it("cabe na coluna sem partir palavra", () => {
    const maximo = campoPorChave("segment")!.tamanhoMaximo;
    const aceitas = filtrarSugestoes(
      [{ ...base, campo: "segment", valor: "Serviços de agrimensura e ".repeat(20) }],
      retrato(),
    );
    // Até 14/09/2026 este teste exigia exatamente `maximo` caracteres, o que
    // era o defeito: o corte caía no meio da palavra e gravava lixo na ficha.
    expect(aceitas[0].valor.length).toBeLessThanOrEqual(maximo);
    expect(aceitas[0].valor.endsWith("e")).toBe(true);
  });

  it("normaliza confiança desconhecida para MEDIA", () => {
    const aceitas = filtrarSugestoes(
      [{ campo: "serviceArea", valor: "Uberlândia e região do Triângulo.", confianca: "altíssima", justificativa: "" }],
      retrato(),
    );
    expect(aceitas[0].confianca).toBe("MEDIA");
  });

  it("respeita o teto de sugestões por rodada", () => {
    const brutas = Array.from({ length: MAXIMO_SUGESTOES + 4 }, (_, indice) => ({
      ...base,
      campo: CAMPOS_DA_IA[indice % CAMPOS_DA_IA.length].chave,
      valor: `Texto suficientemente longo número ${indice}`,
    }));
    expect(filtrarSugestoes(brutas, retrato()).length).toBeLessThanOrEqual(MAXIMO_SUGESTOES);
  });
});

describe("contexto enviado ao modelo", () => {
  const completo = retrato({
    organization: {
      name: "Vale Topografia",
      legalName: "VALE TOPOGRAFIA LTDA",
      segment: null,
      siteUrl: "https://valetopo.com.br",
      cnpjData: {
        cnae_fiscal_descricao: "Serviços de agrimensura",
        municipio: "UBERLANDIA",
        uf: "MG",
        email: "contato@valetopo.com.br",
        ddd_telefone_1: "3432221100",
        cep: "38400100",
        logradouro: "DAS ACACIAS",
      },
    },
    profile: { responsibleCpf: "123.456.789-00", phone: "(34) 3222-1100", city: "Uberlândia" },
  });

  it("leva o que descreve a atividade da empresa", () => {
    const contexto = montarContexto(completo);
    expect(contexto).toContain("Vale Topografia");
    expect(contexto).toContain("Serviços de agrimensura");
    expect(contexto).toContain("UBERLANDIA");
  });

  it("não leva documento, telefone, e-mail nem endereço", () => {
    const contexto = montarContexto(completo);
    expect(contexto).not.toContain("123.456.789-00");
    expect(contexto).not.toContain("3222-1100");
    expect(contexto).not.toContain("contato@valetopo.com.br");
    expect(contexto).not.toContain("DAS ACACIAS");
    expect(contexto).not.toContain("38400");
  });

  it("lista apenas os campos vazios que a IA pode propor", () => {
    const contexto = montarContexto(
      retrato({ profile: { companyDescription: "Já escrito pela equipe." } }),
    );
    expect(contexto).not.toContain("companyDescription (");
    expect(contexto).toContain("servicesOffered (");
  });
});

/**
 * Defeitos achados na conferência visual da tela, antes do merge. Os três
 * viraram teste porque nenhum deles quebra nada em tempo de compilação: a
 * tela mostra número errado, grava texto mutilado ou oferece botão morto, e
 * tudo isso passa num `tsc` limpo.
 */
describe("corte no tamanho da coluna", () => {
  it("não parte palavra no meio", () => {
    // O caso real: descrição de CNAE com 103 caracteres num campo de 80.
    const cnae = "Fabricação de produtos de padaria e confeitaria com predominância de produção própria";
    const cortado = cortarNoTamanho(cnae, 80);

    expect(cortado.length).toBeLessThanOrEqual(80);
    expect(cnae.startsWith(cortado)).toBe(true);
    // O que o slice cru produzia: "...de produção pr".
    expect(cortado.endsWith("pr")).toBe(false);
    expect(cortado).toBe("Fabricação de produtos de padaria e confeitaria com predominância de produção");
  });

  it("devolve o texto inteiro quando já cabe", () => {
    expect(cortarNoTamanho("Padaria", 80)).toBe("Padaria");
  });

  it("corta seco quando não há espaço onde recuar", () => {
    const palavra = "a".repeat(120);
    expect(cortarNoTamanho(palavra, 80)).toBe("a".repeat(80));
  });

  it("não deixa pontuação solta na ponta", () => {
    expect(cortarNoTamanho("Serviços de agrimensura, topografia e geoprocessamento", 30)).toBe(
      "Serviços de agrimensura",
    );
  });
});

describe("origens efetivas sem consulta de CNPJ guardada", () => {
  it("não conta a Receita para quem não tem consulta guardada", () => {
    const analise = analisarCadastro(retrato());

    expect(analise.temConsultaDeCnpj).toBe(false);
    // Dizer "9 a Receita resolve" para este cliente prometeria um clique que
    // não preencheria nada: sem consulta, a Receita não tem o que devolver.
    expect(analise.preenchiveisPelaReceita).toBe(0);
  });

  it("joga os campos oficiais para a lista do que se pergunta ao cliente", () => {
    const analise = analisarCadastro(retrato());
    const razaoSocial = analise.lacunas.find((l) => l.chave === "legalName")!;

    expect(razaoSocial.origens).toEqual(["CLIENTE"]);
  });

  it("mantém a IA como origem de campo descritivo mesmo sem CNPJ", () => {
    const analise = analisarCadastro(retrato());
    const segmento = analise.lacunas.find((l) => l.chave === "segment")!;

    expect(segmento.origens).toContain("IA");
    expect(segmento.origens).not.toContain("RECEITA_FEDERAL");
  });

  it("volta a contar a Receita quando a consulta existe", () => {
    const analise = analisarCadastro(
      retrato({
        organization: {
          name: "Vale",
          legalName: null,
          segment: null,
          siteUrl: null,
          cnpjData: { razao_social: "VALE LTDA" },
        },
      }),
    );

    expect(analise.temConsultaDeCnpj).toBe(true);
    expect(analise.preenchiveisPelaReceita).toBeGreaterThan(0);
    expect(analise.lacunas.find((l) => l.chave === "legalName")!.origens).toContain(
      "RECEITA_FEDERAL",
    );
  });

  it("toda lacuna cabe em pelo menos uma origem, com ou sem CNPJ", () => {
    for (const comCnpj of [true, false]) {
      const analise = analisarCadastro(
        retrato({
          organization: {
            name: "X",
            legalName: null,
            segment: null,
            siteUrl: null,
            cnpjData: comCnpj ? { razao_social: "X LTDA" } : null,
          },
        }),
      );
      expect(analise.lacunas.every((l) => l.origens.length > 0)).toBe(true);
    }
  });
});
