import { describe, expect, it } from "vitest";

import { normalizeTransaction } from "@/lib/efi";

/**
 * Nome da contraparte nas movimentações do Éfi.
 *
 * O que está sendo protegido: a coluna "Origem / destino" da conciliação
 * mostrava "Não informado" em TODAS as linhas — inclusive nas enviadas, onde o
 * Éfi manda o nome. O código lia `favorecido.nome`, e o nome mora em
 * `favorecido.identificacao.nome`. Um nível de diferença, e a página inteira
 * ficou inútil para conciliar sem ninguém ver erro nenhum no log.
 *
 * Os payloads abaixo são a forma real devolvida pela API em 26/08/2026
 * (`/v2/pix` e `/v2/gn/pix/enviados`), com os dados trocados.
 */

const ENVIADO = {
  endToEndId: "E090893562026082520417ea2a6a3aa0",
  valor: "8.00",
  status: "REALIZADO",
  txid: "3f2a1b9c4d5e6f708192a3b4c5d6e7f8",
  horario: {
    solicitacao: "2026-08-25T20:42:23.000Z",
    liquidacao: "2026-08-25T20:42:23.000Z",
  },
  favorecido: {
    chave: "+5517900000000",
    identificacao: {
      nome: "SIGMA COMERCIO DE EQUIPAMENTOS LTDA",
      cnpj: "03000000000175",
    },
  },
};

const RECEBIDO = {
  endToEndId: "E10573521202608222012B1dYlSNLGgo",
  valor: "100.00",
  chave: "pix@avilaops",
  horario: "2026-08-22T20:12:15.798Z",
};

describe("Pix enviado", () => {
  it("pega o nome do favorecido dois níveis abaixo", () => {
    const t = normalizeTransaction(ENVIADO, "DEBIT");

    expect(t.counterpartyName).toBe("SIGMA COMERCIO DE EQUIPAMENTOS LTDA");
  });

  it("sem identificação, a chave ainda diz de quem se trata", () => {
    const semNome = { ...ENVIADO, favorecido: { chave: "+5517900000000" } };

    expect(normalizeTransaction(semNome, "DEBIT").counterpartyName).toBe(
      "+5517900000000",
    );
  });

  it("chave aleatória não vira nome — não identifica ninguém", () => {
    const aleatoria = {
      ...ENVIADO,
      favorecido: { chave: "71d2f4a0-9c3e-4b8a-8f21-6d5e0c7a1b93" },
    };

    expect(normalizeTransaction(aleatoria, "DEBIT").counterpartyName).toBeNull();
  });

  it("ainda aceita o formato antigo, com o nome na raiz do favorecido", () => {
    const antigo = { ...ENVIADO, favorecido: { nome: "FULANO DE TAL" } };

    expect(normalizeTransaction(antigo, "DEBIT").counterpartyName).toBe(
      "FULANO DE TAL",
    );
  });
});

describe("Pix recebido", () => {
  it("fica sem contraparte: o Éfi não devolve o pagador em /v2/pix", () => {
    const t = normalizeTransaction(RECEBIDO, "CREDIT");

    expect(t.counterpartyName).toBeNull();
    expect(t.transactionType).toBe("PIX_RECEIVED");
  });

  it("usa o pagador quando ele existe — Pix vindo de cobrança", () => {
    const comCobranca = {
      ...RECEBIDO,
      txid: "9a8b7c6d5e4f30211f0e9d8c7b6a5940",
      pagador: { nome: "MARIA DA SILVA", cpf: "00000000000" },
    };

    expect(normalizeTransaction(comCobranca, "CREDIT").counterpartyName).toBe(
      "MARIA DA SILVA",
    );
  });
});

describe("texto livre do pagador", () => {
  it("entra na descrição, que é a única pista de um Pix recebido solto", () => {
    const comInfo = { ...RECEBIDO, infoPagador: "pgto redes sociais" };

    expect(normalizeTransaction(comInfo, "CREDIT").description).toBe(
      "Pix recebido · pgto redes sociais",
    );
  });

  it("não ocupa a coluna de contraparte: não é um nome", () => {
    const comInfo = { ...RECEBIDO, infoPagador: "pgto redes sociais" };

    expect(normalizeTransaction(comInfo, "CREDIT").counterpartyName).toBeNull();
  });

  it("sem texto livre, a descrição continua a de sempre", () => {
    expect(normalizeTransaction(RECEBIDO, "CREDIT").description).toBe(
      "Pix recebido",
    );
    expect(normalizeTransaction(ENVIADO, "DEBIT").description).toBe(
      "Pix enviado",
    );
  });

  it("texto longo é cortado para não estourar a linha da tabela", () => {
    const longo = { ...RECEBIDO, infoPagador: "x".repeat(200) };
    const { description } = normalizeTransaction(longo, "CREDIT");

    expect(description.length).toBeLessThanOrEqual("Pix recebido · ".length + 80);
    expect(description.endsWith("…")).toBe(true);
  });
});

describe("identidade da movimentação", () => {
  it("o externalId separa as duas pontas do mesmo endToEndId", () => {
    const enviado = normalizeTransaction(ENVIADO, "DEBIT");
    const recebido = normalizeTransaction(RECEBIDO, "CREDIT");

    expect(enviado.externalId).toBe(`sent:${ENVIADO.endToEndId}`);
    expect(recebido.externalId).toBe(`received:${RECEBIDO.endToEndId}`);
  });

  it("o horário do enviado vem de horario.solicitacao, que é objeto", () => {
    const t = normalizeTransaction(ENVIADO, "DEBIT");

    expect(t.occurredAt.toISOString()).toBe("2026-08-25T20:42:23.000Z");
  });
});
