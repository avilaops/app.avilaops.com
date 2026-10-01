import { describe, expect, it } from "vitest";
import { TAMANHO_MAXIMO_ICONE, mimeReal } from "@/lib/identidade-casa";

/**
 * O que decide se um arquivo vira o ícone do painel.
 *
 * A regra é lida dos BYTES, e não do que o navegador declarou: `content-type`
 * de upload é texto que quem envia escolhe. Aceitar a palavra dele deixaria
 * qualquer arquivo entrar com rótulo de imagem — e a imagem é servida do mesmo
 * domínio da sessão de todo mundo.
 */

function comCabecalho(bytes: number[], tamanho = 32): Buffer {
  const dados = Buffer.alloc(tamanho);
  Buffer.from(bytes).copy(dados);
  return dados;
}

describe("mimeReal", () => {
  it("reconhece PNG pela assinatura", () => {
    expect(mimeReal(comCabecalho([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
  });

  it("reconhece JPEG pela assinatura", () => {
    expect(mimeReal(comCabecalho([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
  });

  it("reconhece WebP, que precisa dos dois pedaços", () => {
    const dados = Buffer.alloc(32);
    dados.write("RIFF", 0, "ascii");
    dados.write("WEBP", 8, "ascii");
    expect(mimeReal(dados)).toBe("image/webp");

    // Só o "RIFF" não basta: é o contêiner de WAV e AVI também.
    const soRiff = Buffer.alloc(32);
    soRiff.write("RIFF", 0, "ascii");
    soRiff.write("WAVE", 8, "ascii");
    expect(mimeReal(soRiff)).toBeNull();
  });

  it("recusa SVG, que é o caso perigoso", () => {
    // SVG é XML, aceita <script> e seria servido do domínio do painel: um logo
    // trocado viraria execução de código na sessão de quem abrisse a tela.
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(mimeReal(svg)).toBeNull();
  });

  it("recusa HTML e arquivo vazio", () => {
    expect(mimeReal(Buffer.from("<!doctype html><html></html>"))).toBeNull();
    expect(mimeReal(Buffer.alloc(0))).toBeNull();
    expect(mimeReal(Buffer.from([0x89, 0x50]))).toBeNull();
  });

  it("não se engana com PNG de assinatura quase certa", () => {
    // Um byte trocado no fim da assinatura: é o que um arquivo corrompido ou
    // disfarçado traz.
    expect(mimeReal(comCabecalho([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0b]))).toBeNull();
  });
});

describe("limite do ícone", () => {
  it("são 512 KB, que é folga para um quadrado de 28 pixels", () => {
    expect(TAMANHO_MAXIMO_ICONE).toBe(512 * 1024);
  });
});
