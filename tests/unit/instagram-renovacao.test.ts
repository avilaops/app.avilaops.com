import { describe, expect, it } from "vitest";
import {
  JANELA_RENOVACAO_DIAS,
  classificarToken,
  type ConexaoParaClassificar,
} from "@/lib/instagram-renovacao";

const AGORA = new Date("2026-09-19T12:00:00.000Z");
const DIA_MS = 24 * 60 * 60 * 1_000;

function conexao(dias: number | null, comToken = true): ConexaoParaClassificar {
  return {
    tokenCiphertext: comToken ? "iv.tag.payload" : null,
    tokenExpiresAt: dias === null ? null : new Date(AGORA.getTime() + dias * DIA_MS),
  };
}

describe("classificarToken", () => {
  it("não mexe em token com validade confortável", () => {
    expect(classificarToken(conexao(45), AGORA)).toBe("EM_DIA");
    expect(classificarToken(conexao(JANELA_RENOVACAO_DIAS + 1), AGORA)).toBe("EM_DIA");
  });

  it("renova dentro da janela, incluindo a borda", () => {
    expect(classificarToken(conexao(JANELA_RENOVACAO_DIAS), AGORA)).toBe("RENOVAR");
    expect(classificarToken(conexao(3), AGORA)).toBe("RENOVAR");
  });

  it("renova o que vence em minutos, e não o trata como vencido", () => {
    // A rotina roda de madrugada; token que vence às 9h do mesmo dia ainda dá
    // para salvar. Errar aqui custa a reconexão manual do cliente.
    const emUmaHora: ConexaoParaClassificar = {
      tokenCiphertext: "iv.tag.payload",
      tokenExpiresAt: new Date(AGORA.getTime() + 60 * 60 * 1_000),
    };
    expect(classificarToken(emUmaHora, AGORA)).toBe("RENOVAR");
  });

  it("marca como vencido no instante exato do vencimento", () => {
    // Exatamente na hora já é tarde: a Meta recusa renovar token vencido, e
    // tentar mesmo assim só gera erro no lugar de dizer a verdade na tela.
    expect(classificarToken(conexao(0), AGORA)).toBe("VENCIDO");
    expect(classificarToken(conexao(-1), AGORA)).toBe("VENCIDO");
  });

  it("tenta renovar conexão sem validade gravada, em vez de ignorar", () => {
    // Ignorar seria deixar a conexão apodrecer sem ninguém saber quando vence.
    // A tentativa ou renova, ou grava o erro da Meta, e nos dois casos passa a
    // existir uma data.
    expect(classificarToken(conexao(null), AGORA)).toBe("SEM_VALIDADE");
  });

  it("não tenta renovar conexão sem token", () => {
    expect(classificarToken(conexao(2, false), AGORA)).toBe("SEM_TOKEN");
    expect(classificarToken(conexao(null, false), AGORA)).toBe("SEM_TOKEN");
  });

  it("aceita janela própria, para a rotina poder ser mais agressiva sem edição", () => {
    expect(classificarToken(conexao(20), AGORA, 30)).toBe("RENOVAR");
    expect(classificarToken(conexao(20), AGORA, 10)).toBe("EM_DIA");
  });
});
