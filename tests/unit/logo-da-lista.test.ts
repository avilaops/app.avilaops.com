import { describe, expect, it } from "vitest";
import { logoDaLista, type AtivoParaALista } from "@/lib/marca/logo-da-lista";

/**
 * Qual arquivo da marca vira a miniatura do cliente na lista. A ordem dos
 * ativos recebidos é a da consulta (mais recente primeiro); o que decide é o
 * tipo, e dentro do tipo o primeiro que chegou.
 */
function ativo(id: string, assetType: string, parcial: Partial<AtivoParaALista> = {}): AtivoParaALista {
  return { id, assetType, mimeType: "image/png", storageKey: `local:org/${id}.png`, ...parcial };
}

describe("logoDaLista", () => {
  it("prefere o ícone quadrado já gerado à logo de onde ele saiu", () => {
    expect(logoDaLista([ativo("logo", "Logo principal"), ativo("icone", "Ícone 192x192")])).toBe("icone");
  });

  it("sem ícone gerado, o símbolo vem antes das logos, e a horizontal é a última", () => {
    expect(logoDaLista([ativo("h", "Logo horizontal"), ativo("p", "Logo principal"), ativo("s", "Símbolo")])).toBe("s");
    expect(logoDaLista([ativo("h", "Logo horizontal"), ativo("v", "Logo vertical")])).toBe("v");
    expect(logoDaLista([ativo("h", "Logo horizontal")])).toBe("h");
  });

  it("entre dois do mesmo tipo fica o primeiro, que a consulta entrega como o mais recente", () => {
    expect(logoDaLista([ativo("novo", "Símbolo"), ativo("antigo", "Símbolo")])).toBe("novo");
  });

  it("ignora o que não é imagem exibível ou não tem arquivo", () => {
    expect(
      logoDaLista([
        ativo("pdf", "Logo principal", { mimeType: "application/pdf" }),
        ativo("link", "Símbolo", { storageKey: null }),
        ativo("semtipo", "Logo vertical", { mimeType: null }),
        ativo("ico", "Favicon", { mimeType: "image/x-icon" }),
      ]),
    ).toBeNull();
  });

  it("cliente sem arquivo de marca não tem miniatura", () => {
    expect(logoDaLista([])).toBeNull();
    expect(logoDaLista([ativo("manual", "Manual da marca")])).toBeNull();
  });
});
