import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { coresDaLogo } from "@/lib/estudio/marca";

/**
 * A cor da peça do cliente sai da logo dele. O que estes testes travam é que a
 * leitura é medição e não chute: fundo branco e transparência não podem virar
 * "a cor da marca", senão toda peça sairia branca.
 */

async function logo(opcoes: {
  fundo: { r: number; g: number; b: number; alpha: number };
  marca?: { cor: { r: number; g: number; b: number }; lado: number };
}): Promise<Buffer> {
  const tela = sharp({
    create: { width: 200, height: 200, channels: 4, background: opcoes.fundo },
  });
  if (!opcoes.marca) return tela.png().toBuffer();

  const bloco = await sharp({
    create: {
      width: opcoes.marca.lado,
      height: opcoes.marca.lado,
      channels: 4,
      background: { ...opcoes.marca.cor, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  return tela.composite([{ input: bloco, gravity: "centre" }]).png().toBuffer();
}

const TRANSPARENTE = { r: 0, g: 0, b: 0, alpha: 0 };
const BRANCO = { r: 255, g: 255, b: 255, alpha: 1 };

describe("coresDaLogo", () => {
  it("acha a cor da marca mesmo com a logo boiando em transparência", async () => {
    const png = await logo({
      fundo: TRANSPARENTE,
      marca: { cor: { r: 29, g: 111, b: 224 }, lado: 60 },
    });
    const cores = await coresDaLogo(png);
    expect(cores).not.toBeNull();
    expect(cores!.destaque.toLowerCase()).toBe("#1d6fe0");
  });

  it("ignora o fundo branco: ele é papel, não é a marca", async () => {
    const png = await logo({
      fundo: BRANCO,
      // A marca ocupa bem menos que o fundo; sem o corte de luminância, o
      // branco seria a cor mais frequente e venceria.
      marca: { cor: { r: 200, g: 30, b: 30 }, lado: 50 },
    });
    const cores = await coresDaLogo(png);
    expect(cores!.destaque.toLowerCase()).toBe("#c81e1e");
    expect(cores!.primaria.toLowerCase()).toBe("#c81e1e");
  });

  it("primária é a mais escura das dominantes — é ela que vira fundo da peça", async () => {
    const claro = await sharp({
      create: { width: 40, height: 40, channels: 4, background: { r: 90, g: 200, b: 250, alpha: 1 } },
    })
      .png()
      .toBuffer();
    const escuro = await sharp({
      create: { width: 60, height: 60, channels: 4, background: { r: 16, g: 40, b: 64, alpha: 1 } },
    })
      .png()
      .toBuffer();
    const png = await sharp({
      create: { width: 200, height: 200, channels: 4, background: TRANSPARENTE },
    })
      .composite([
        { input: escuro, left: 20, top: 20 },
        { input: claro, left: 120, top: 120 },
      ])
      .png()
      .toBuffer();

    const cores = await coresDaLogo(png);
    expect(cores!.primaria.toLowerCase()).toBe("#102840");
    expect(cores!.destaque.toLowerCase()).toBe("#102840");
  });

  it("logo só de fundo branco não devolve cor nenhuma — quem chama cai no padrão", async () => {
    expect(await coresDaLogo(await logo({ fundo: BRANCO }))).toBeNull();
  });

  it("logo inteiramente transparente também não inventa cor", async () => {
    expect(await coresDaLogo(await logo({ fundo: TRANSPARENTE }))).toBeNull();
  });
});
