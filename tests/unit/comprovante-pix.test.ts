import { describe, expect, it } from "vitest";
import {
  conferirComprovante,
  ehIdentificadorPix,
  instanteDoIdentificador,
  normalizarIdentificador,
  notaDoComprovante,
} from "@/lib/comprovante-pix";

/** Pix recebido em 18/09/2026 às 18:37 de Brasília — 21:37 em UTC. */
const E2E = "E09089356202609182137ABC123DEF45";
const MOVIMENTACAO = { endToEndId: E2E, direction: "CREDIT" };

describe("identificador ponta a ponta", () => {
  it("aceita o formato do Banco Central e recusa o resto", () => {
    expect(ehIdentificadorPix(E2E)).toBe(true);
    expect(ehIdentificadorPix(`${E2E}9`)).toBe(false);
    expect(ehIdentificadorPix(E2E.slice(0, 31))).toBe(false);
    // Sem o "E" inicial é outro identificador qualquer, não um Pix.
    expect(ehIdentificadorPix(`X${E2E.slice(1)}`)).toBe(false);
  });

  it("limpa o que vem colado do comprovante", () => {
    // Comprovante copiado da tela vem picotado por espaço e quebra de linha.
    expect(normalizarIdentificador(" e09089356 2026091821\n37abc123def45 ")).toBe(E2E);
    expect(conferirComprovante(
      { identificador: " e09089356 202609182137 abc123def45", pagador: "Mello Transportes" },
      MOVIMENTACAO,
    ).ok).toBe(true);
  });

  it("lê o instante em UTC que o próprio identificador carrega", () => {
    expect(instanteDoIdentificador(E2E)?.toISOString()).toBe("2026-09-18T21:37:00.000Z");
    expect(instanteDoIdentificador("E09089356202613182137ABC123DEF45")).toBeNull();
  });
});

describe("conferirComprovante", () => {
  it("identifica o pagador quando o comprovante é desta movimentação", () => {
    const resultado = conferirComprovante(
      {
        identificador: E2E,
        pagador: "  MELLO TRANSPORTES   RIO PRETO LTDA ",
        documento: "11.222.333/0001-81",
      },
      MOVIMENTACAO,
    );

    expect(resultado).toMatchObject({
      ok: true,
      comprovante: {
        identificador: E2E,
        pagador: "MELLO TRANSPORTES RIO PRETO LTDA",
        documento: "11222333000181",
        tipoDocumento: "CNPJ",
      },
    });
  });

  it("recusa comprovante de outra transferência", () => {
    // O caso que a tela existe para impedir: dois Pix de mesmo valor no mesmo
    // dia, e o comprovante colado é o do outro.
    const resultado = conferirComprovante(
      { identificador: "E09089356202609182137ZZZ999YYY88", pagador: "Mello Transportes" },
      MOVIMENTACAO,
    );

    expect(resultado.ok).toBe(false);
    expect(resultado).toMatchObject({ erro: expect.stringContaining("outra transferência") });
  });

  it("recusa quando a movimentação não tem identificador para conferir", () => {
    // Sem os dois lados não há prova; gravar assim seria só palavra de quem digitou.
    const resultado = conferirComprovante(
      { identificador: E2E, pagador: "Mello Transportes" },
      { endToEndId: null, direction: "CREDIT" },
    );

    expect(resultado.ok).toBe(false);
    expect(resultado).toMatchObject({ erro: expect.stringContaining("não tem identificador") });
  });

  it("recusa documento inválido e nome vazio", () => {
    expect(
      conferirComprovante(
        { identificador: E2E, pagador: "Mello Transportes", documento: "11.222.333/0001-00" },
        MOVIMENTACAO,
      ),
    ).toMatchObject({ ok: false, erro: expect.stringContaining("inválido") });

    expect(
      conferirComprovante({ identificador: E2E, pagador: " " }, MOVIMENTACAO),
    ).toMatchObject({ ok: false });
  });

  it("aceita comprovante sem documento, porque nem todo comprovante traz um", () => {
    const resultado = conferirComprovante(
      { identificador: E2E, pagador: "Mello Transportes Rio Preto LTDA" },
      MOVIMENTACAO,
    );

    expect(resultado).toMatchObject({
      ok: true,
      comprovante: { documento: null, tipoDocumento: null },
    });
  });
});

describe("notaDoComprovante", () => {
  it("guarda o que sustenta a decisão, não só que ela foi tomada", () => {
    const resultado = conferirComprovante(
      {
        identificador: E2E,
        pagador: "Mello Transportes Rio Preto LTDA",
        documento: "11222333000181",
      },
      MOVIMENTACAO,
    );
    if (!resultado.ok) throw new Error("comprovante deveria conferir");

    const nota = notaDoComprovante(resultado.comprovante);
    expect(nota).toContain("Mello Transportes Rio Preto LTDA");
    expect(nota).toContain("CNPJ 11222333000181");
    expect(nota).toContain("identificador confere");
    expect(nota.length).toBeLessThanOrEqual(300);
  });
});
