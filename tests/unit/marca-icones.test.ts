import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  ICONES_DERIVADOS,
  OPCOES_PADRAO,
  especPorTipo,
  manifesto,
  saneiaOpcoes,
  trechoHtml,
} from "@/lib/marca/especificacoes";
import { gerarIcone, gerarIcones, montarIco } from "@/lib/marca/icones";

/** Logo de teste: quadrado vermelho de 100px centralizado numa tela de 400px. */
async function logoPng(): Promise<Buffer> {
  const quadrado = await sharp({
    create: { width: 100, height: 100, channels: 4, background: { r: 220, g: 30, b: 30, alpha: 1 } },
  })
    .png()
    .toBuffer();
  return sharp({
    create: { width: 400, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: quadrado, gravity: "centre" }])
    .png()
    .toBuffer();
}

const LOGO_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#0A5"/></svg>',
);

describe("saneiaOpcoes", () => {
  it("aceita só hexadecimal de 6 dígitos como fundo", () => {
    expect(saneiaOpcoes({ fundo: "#ff8800" }).fundo).toBe("#FF8800");
    expect(saneiaOpcoes({ fundo: "vermelho" }).fundo).toBeNull();
    expect(saneiaOpcoes({ fundo: "#fff" }).fundo).toBeNull();
    expect(saneiaOpcoes({}).fundo).toBeNull();
  });

  it("prende a folga entre 0 e 40% e cai no padrão quando não é número", () => {
    expect(saneiaOpcoes({ margem: 200 }).margem).toBe(40);
    expect(saneiaOpcoes({ margem: -5 }).margem).toBe(0);
    expect(saneiaOpcoes({ margem: "muito" }).margem).toBe(OPCOES_PADRAO.margem);
  });

  it("descarta tipo de ícone que não existe", () => {
    const opcoes = saneiaOpcoes({ tipos: ["Favicon", "Outdoor", "Ícone 512x512"] });
    expect(opcoes.tipos).toEqual(["Favicon", "Ícone 512x512"]);
  });
});

describe("montarIco", () => {
  it("escreve o cabeçalho ICO, uma entrada por resolução e os deslocamentos certos", () => {
    const a = Buffer.alloc(40, 1);
    const b = Buffer.alloc(70, 2);
    const ico = montarIco([
      { lado: 32, png: b },
      { lado: 16, png: a },
    ]);

    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1); // tipo ícone
    expect(ico.readUInt16LE(4)).toBe(2); // duas imagens

    // Ordenado por lado: 16 primeiro.
    expect(ico.readUInt8(6)).toBe(16);
    expect(ico.readUInt32LE(6 + 8)).toBe(a.length);
    expect(ico.readUInt32LE(6 + 12)).toBe(6 + 32);

    expect(ico.readUInt8(22)).toBe(32);
    expect(ico.readUInt32LE(22 + 8)).toBe(b.length);
    expect(ico.readUInt32LE(22 + 12)).toBe(6 + 32 + a.length);

    expect(ico.length).toBe(6 + 32 + a.length + b.length);
  });

  it("recusa lista vazia em vez de gravar um .ico quebrado", () => {
    expect(() => montarIco([])).toThrow();
  });
});

describe("gerarIcone", () => {
  it("entrega cada ícone na dimensão que a especificação promete", async () => {
    const logo = await logoPng();
    for (const spec of ICONES_DERIVADOS.filter((i) => !i.resolucoesIco)) {
      const { buffer } = await gerarIcone(logo, "image/png", spec, saneiaOpcoes({}));
      const meta = await sharp(buffer).metadata();
      expect([spec.assetType, meta.width, meta.height]).toEqual([
        spec.assetType,
        spec.largura,
        spec.altura,
      ]);
      expect(meta.format).toBe("png");
    }
  });

  it("o favicon sai como .ico com as três resoluções embutidas", async () => {
    const spec = especPorTipo("Favicon")!;
    const { buffer } = await gerarIcone(await logoPng(), "image/png", spec, saneiaOpcoes({}));
    expect(buffer.readUInt16LE(2)).toBe(1);
    expect(buffer.readUInt16LE(4)).toBe(3);
    expect([buffer.readUInt8(6), buffer.readUInt8(22), buffer.readUInt8(38)]).toEqual([16, 32, 48]);
  });

  it("Apple Touch Icon vai opaco mesmo com logo transparente — o iOS pinta alfa de preto", async () => {
    const spec = especPorTipo("Apple Touch Icon")!;
    const { buffer } = await gerarIcone(await logoPng(), "image/png", spec, saneiaOpcoes({}));
    const canto = await sharp(buffer).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
    expect(canto[3]).toBe(255);
    expect([canto[0], canto[1], canto[2]]).toEqual([255, 255, 255]);
  });

  it("o favicon fica transparente quando nenhum fundo é escolhido", async () => {
    const spec = especPorTipo("Ícone 512x512")!;
    const { buffer } = await gerarIcone(await logoPng(), "image/png", spec, saneiaOpcoes({ margem: 20 }));
    const canto = await sharp(buffer).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
    expect(canto[3]).toBe(0);
  });

  it("o fundo escolhido vale para todos, inclusive os transparentes por padrão", async () => {
    const spec = especPorTipo("Ícone 192x192")!;
    const { buffer } = await gerarIcone(
      await logoPng(),
      "image/png",
      spec,
      saneiaOpcoes({ fundo: "#102030" }),
    );
    const canto = await sharp(buffer).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
    expect([canto[0], canto[1], canto[2], canto[3]]).toEqual([16, 32, 48, 255]);
  });

  it("recorta a moldura vazia: com recorte a logo ocupa mais do ícone", async () => {
    // A logo de teste é um quadrado de 100px numa tela de 400px. Sem recorte,
    // a moldura transparente entra junto e a marca sai minúscula no ícone.
    const spec = especPorTipo("Ícone 192x192")!;
    const logo = await logoPng();

    const comRecorte = await gerarIcone(logo, "image/png", spec, saneiaOpcoes({ margem: 0, recortar: true }));
    const semRecorte = await gerarIcone(logo, "image/png", spec, saneiaOpcoes({ margem: 0, recortar: false }));

    const opacos = async (buffer: Buffer) => {
      const cru = await sharp(buffer).raw().toBuffer();
      let total = 0;
      for (let i = 3; i < cru.length; i += 4) if (cru[i] > 0) total += 1;
      return total;
    };

    expect(await opacos(comRecorte.buffer)).toBeGreaterThan((await opacos(semRecorte.buffer)) * 2);
  });

  it("rasteriza SVG em vez de recusar", async () => {
    const spec = especPorTipo("Ícone 512x512")!;
    const { buffer } = await gerarIcone(LOGO_SVG, "image/svg+xml", spec, saneiaOpcoes({}));
    const meta = await sharp(buffer).metadata();
    expect([meta.width, meta.height]).toEqual([512, 512]);
  });
});

describe("gerarIcones", () => {
  it("sem lista de tipos gera o conjunto inteiro", async () => {
    const gerados = await gerarIcones(await logoPng(), "image/png", saneiaOpcoes({}));
    expect(gerados.map((g) => g.spec.assetType)).toEqual(ICONES_DERIVADOS.map((i) => i.assetType));
    expect(gerados.every((g) => g.bytes > 0)).toBe(true);
  });

  it("com lista, gera só o que foi pedido", async () => {
    const gerados = await gerarIcones(
      await logoPng(),
      "image/png",
      saneiaOpcoes({ tipos: ["Favicon", "Apple Touch Icon"] }),
    );
    expect(gerados.map((g) => g.spec.assetType)).toEqual(["Favicon", "Apple Touch Icon"]);
  });

  it("recusa origem que não é imagem que dá para redimensionar", async () => {
    await expect(gerarIcones(Buffer.from("%PDF-1.4"), "application/pdf", saneiaOpcoes({}))).rejects.toThrow(
      /PNG, JPG, WEBP ou SVG/,
    );
  });
});

describe("trecho para o site", () => {
  it("o HTML aponta para os quatro arquivos do conjunto", () => {
    const html = trechoHtml();
    expect(html).toContain('href="/favicon.ico"');
    expect(html).toContain('href="/icone-192.png"');
    expect(html).toContain('href="/apple-touch-icon.png"');
    expect(html).toContain('href="/site.webmanifest"');
  });

  it("o manifesto lista os dois ícones e usa o fundo como cor de tema", () => {
    const json = JSON.parse(manifesto("Saúde Pet Brasil", "#0a5533")) as {
      name: string;
      icons: { sizes: string }[];
      theme_color: string;
    };
    expect(json.name).toBe("Saúde Pet Brasil");
    expect(json.icons.map((i) => i.sizes)).toEqual(["192x192", "512x512"]);
    expect(json.theme_color).toBe("#0A5533");
  });

  it("sem cor escolhida o tema cai no branco em vez de ficar vazio", () => {
    expect(JSON.parse(manifesto("Ávila", null)).theme_color).toBe("#FFFFFF");
  });
});
