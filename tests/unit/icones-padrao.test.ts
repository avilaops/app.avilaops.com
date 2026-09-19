import { describe, expect, it } from "vitest";
import {
  ARQUIVO_AUSENTE,
  avaliarPadrao,
  estadoDoPadrao,
  ladoDeclarado,
  lerCabecaHtml,
  lerManifesto,
  notaDoPadrao,
  pendenciaPrincipal,
  type ArquivoRemoto,
  type ColetaIcones,
} from "@/lib/icones/padrao";

const png = (largura: number, altura: number, opaco: boolean): ArquivoRemoto => ({
  ...ARQUIVO_AUSENTE,
  status: 200,
  contentType: "image/png",
  bytes: 1024,
  largura,
  altura,
  opaco,
});

const ico = (lados: number[]): ArquivoRemoto => ({
  ...ARQUIVO_AUSENTE,
  status: 200,
  contentType: "image/x-icon",
  bytes: 4096,
  ehIco: true,
  ladosIco: lados,
});

const MANIFESTO_BOM = JSON.stringify({
  name: "Padaria Aurora",
  short_name: "Aurora",
  start_url: "/",
  scope: "/",
  display: "standalone",
  icons: [
    { src: "/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
});

const HTML_BOM = `
<!doctype html><html><head>
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" sizes="192x192" href="/icone-192.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">
  <meta property="og:image" content="https://exemplo.com/open-graph-1200x630.png">
  <meta name="theme-color" content="#2563EB">
</head><body></body></html>`;

function coletaCompleta(): ColetaIcones {
  return {
    html: { status: 200, cabeca: lerCabecaHtml(HTML_BOM) },
    faviconRaiz: ico([16, 32, 48]),
    appleTouch: png(180, 180, true),
    manifesto: { caminho: "/site.webmanifest", status: 200, dados: lerManifesto(MANIFESTO_BOM) },
    iconesManifesto: [png(192, 192, true), png(512, 512, true), png(512, 512, true)],
    ogImage: png(1200, 630, true),
  };
}

const item = (coleta: ColetaIcones, chave: string) =>
  avaliarPadrao(coleta).find((i) => i.chave === chave)!;

describe("leitura do <head>", () => {
  it("acha ícone, apple-touch-icon, manifesto, og:image e theme-color", () => {
    const cabeca = lerCabecaHtml(HTML_BOM);
    expect(cabeca.icones).toHaveLength(2);
    expect(cabeca.appleTouchIcon).toBe("/apple-touch-icon.png");
    expect(cabeca.manifest).toBe("/site.webmanifest");
    expect(cabeca.ogImage).toBe("https://exemplo.com/open-graph-1200x630.png");
    expect(cabeca.themeColor).toBe("#2563EB");
  });

  it("aceita o atributo antes do rel, que é como muito site antigo escreve", () => {
    const cabeca = lerCabecaHtml('<link href="/f.ico" rel="shortcut icon">');
    expect(cabeca.icones.map((i) => i.href)).toEqual(["/f.ico"]);
  });

  it("não confunde og:image com outra meta e lê content antes de property", () => {
    const cabeca = lerCabecaHtml('<meta content="/capa.png" property="og:image">');
    expect(cabeca.ogImage).toBe("/capa.png");
  });

  it("devolve vazio quando não há nada declarado", () => {
    const cabeca = lerCabecaHtml("<html><head><title>x</title></head></html>");
    expect(cabeca.icones).toEqual([]);
    expect(cabeca.appleTouchIcon).toBeNull();
    expect(cabeca.manifest).toBeNull();
  });
});

describe("leitura do manifesto", () => {
  it("separa purpose em palavras e ignora ícone sem src", () => {
    const m = lerManifesto(
      JSON.stringify({ icons: [{ src: "/a.png", purpose: "any maskable" }, { sizes: "512x512" }] }),
    );
    expect(m?.icones).toHaveLength(1);
    expect(m?.icones[0].purpose).toEqual(["any", "maskable"]);
  });

  it("devolve null para JSON inválido em vez de explodir", () => {
    expect(lerManifesto("{ nao é json }")).toBeNull();
    expect(lerManifesto("[]")?.icones).toEqual([]);
  });

  it("lado declarado só vale para medida quadrada", () => {
    expect(ladoDeclarado("192x192")).toBe(192);
    expect(ladoDeclarado("1200x630")).toBeNull();
    expect(ladoDeclarado("any")).toBeNull();
    expect(ladoDeclarado(null)).toBeNull();
  });
});

describe("padrão de entrega", () => {
  it("um conjunto completo tira 100 e fica ACTIVE, sem pendência", () => {
    const itens = avaliarPadrao(coletaCompleta());
    expect(itens.every((i) => i.ok)).toBe(true);
    expect(notaDoPadrao(itens)).toBe(100);
    expect(estadoDoPadrao(100)).toBe("ACTIVE");
    expect(pendenciaPrincipal(itens)).toBeNull();
  });

  it("os pesos somam 100, senão a nota não é porcentagem de nada", () => {
    const soma = avaliarPadrao(coletaCompleta()).reduce((s, i) => s + i.peso, 0);
    expect(soma).toBe(100);
  });

  // O defeito que motivou o padrão: o iOS ignora SVG em apple-touch-icon e cai
  // no letreiro com a inicial do domínio.
  it("reprova apple-touch-icon em SVG e diz por quê", () => {
    const coleta = coletaCompleta();
    coleta.appleTouch = { ...ARQUIVO_AUSENTE, status: 200, contentType: "image/svg+xml" };
    const apple = item(coleta, "apple-touch-icon");
    expect(apple.ok).toBe(false);
    expect(apple.detalhe).toContain("iOS ignora");
  });

  // O iOS pinta alfa de preto: um PNG 180×180 transparente vira borrão escuro.
  it("reprova apple-touch-icon com transparência", () => {
    const coleta = coletaCompleta();
    coleta.appleTouch = png(180, 180, false);
    const apple = item(coleta, "apple-touch-icon");
    expect(apple.ok).toBe(false);
    expect(apple.detalhe).toContain("transparência");
  });

  it("reprova apple-touch-icon fora de 180×180", () => {
    const coleta = coletaCompleta();
    coleta.appleTouch = png(120, 120, true);
    expect(item(coleta, "apple-touch-icon").ok).toBe(false);
  });

  // O que o #23 corrigiu no app da casa: só maskable, sem reserva any.
  it("reprova manifesto só com maskable", () => {
    const coleta = coletaCompleta();
    coleta.manifesto.dados = lerManifesto(
      JSON.stringify({
        name: "x",
        short_name: "x",
        start_url: "/",
        display: "standalone",
        icons: [
          { src: "/a.png", sizes: "192x192", purpose: "maskable" },
          { src: "/b.png", sizes: "512x512", purpose: "maskable" },
        ],
      }),
    );
    const purpose = item(coleta, "manifesto-purpose");
    expect(purpose.ok).toBe(false);
    expect(purpose.detalhe).toContain("círculo de 80%");
  });

  it("reprova manifesto só com any", () => {
    const coleta = coletaCompleta();
    coleta.manifesto.dados = lerManifesto(
      JSON.stringify({
        name: "x",
        short_name: "x",
        start_url: "/",
        display: "standalone",
        icons: [
          { src: "/a.png", sizes: "192x192" },
          { src: "/b.png", sizes: "512x512" },
        ],
      }),
    );
    expect(item(coleta, "manifesto-purpose").ok).toBe(false);
  });

  it("ícone sem purpose conta como any, que é o padrão da especificação", () => {
    const coleta = coletaCompleta();
    coleta.manifesto.dados = lerManifesto(
      JSON.stringify({
        name: "x",
        short_name: "x",
        start_url: "/",
        display: "standalone",
        icons: [
          { src: "/a.png", sizes: "192x192" },
          { src: "/b.png", sizes: "512x512", purpose: "maskable" },
        ],
      }),
    );
    expect(item(coleta, "manifesto-purpose").ok).toBe(true);
  });

  it("sem start_url o manifesto não é instalável", () => {
    const coleta = coletaCompleta();
    coleta.manifesto.dados = lerManifesto(
      JSON.stringify({ name: "x", short_name: "x", display: "standalone", icons: [] }),
    );
    const instalavel = item(coleta, "manifesto-instalavel");
    expect(instalavel.ok).toBe(false);
    expect(instalavel.detalhe).toContain("start_url");
  });

  it("favicon que responde mas não é .ico reprova", () => {
    const coleta = coletaCompleta();
    coleta.faviconRaiz = { ...png(32, 32, true), contentType: "image/png", ehIco: false };
    const favicon = item(coleta, "favicon-ico");
    expect(favicon.ok).toBe(false);
    expect(favicon.detalhe).toContain("não é um .ico");
  });

  it("favicon .ico sem os três tamanhos diz quais faltam", () => {
    const coleta = coletaCompleta();
    coleta.faviconRaiz = ico([16]);
    const favicon = item(coleta, "favicon-ico");
    expect(favicon.ok).toBe(false);
    expect(favicon.detalhe).toContain("faltam 32, 48");
  });

  // O arquivo existir não basta se o HTML não o declara — foi o caso de um
  // site cujo manifesto estava no ar e ninguém achava.
  it("manifesto no ar mas não declarado reprova, e o detalhe diz onde ele está", () => {
    const coleta = coletaCompleta();
    coleta.html.cabeca = lerCabecaHtml("<html><head></head></html>");
    const manifesto = item(coleta, "manifesto");
    expect(manifesto.ok).toBe(false);
    expect(manifesto.detalhe).toContain("/site.webmanifest");
    expect(manifesto.detalhe).toContain("não o declara");
  });

  it("ícone do manifesto que não responde reprova o item de servidos", () => {
    const coleta = coletaCompleta();
    coleta.iconesManifesto = [png(192, 192, true), { ...ARQUIVO_AUSENTE, status: 404 }, png(512, 512, true)];
    const servidos = item(coleta, "manifesto-servidos");
    expect(servidos.ok).toBe(false);
    expect(servidos.detalhe).toContain("1 de 3");
  });

  it("og:image menor que 1200×630 reprova", () => {
    const coleta = coletaCompleta();
    coleta.ogImage = png(600, 315, true);
    expect(item(coleta, "og-image").ok).toBe(false);
  });

  it("site sem nada tira zero e a pendência é o item de maior peso", () => {
    const vazia: ColetaIcones = {
      html: { status: 404, cabeca: null },
      faviconRaiz: ARQUIVO_AUSENTE,
      appleTouch: ARQUIVO_AUSENTE,
      manifesto: { caminho: null, status: null, dados: null },
      iconesManifesto: [],
      ogImage: ARQUIVO_AUSENTE,
    };
    const itens = avaliarPadrao(vazia);
    expect(notaDoPadrao(itens)).toBe(0);
    expect(estadoDoPadrao(0)).toBe("FAIL");
    expect(pendenciaPrincipal(itens)).toBe("Apple Touch Icon");
  });

  it("a régua é mais dura que a do SEO: 89 ainda não é padrão cumprido", () => {
    expect(estadoDoPadrao(90)).toBe("ACTIVE");
    expect(estadoDoPadrao(89)).toBe("WARNING");
    expect(estadoDoPadrao(60)).toBe("WARNING");
    expect(estadoDoPadrao(59)).toBe("FAIL");
  });
});
