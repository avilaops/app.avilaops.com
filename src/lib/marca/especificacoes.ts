/**
 * Especificação dos ícones derivados da logo — sem sharp e sem node, para a
 * tela poder importar a mesma lista que o servidor usa ao gerar.
 */

/** Rótulos idênticos aos cards de "Identidade e arquivos" do dossiê. */
export type TipoIconeDerivado =
  | "Favicon"
  | "Ícone 192x192"
  | "Ícone 512x512"
  | "Apple Touch Icon"
  | "Preview image"
  | "Open Graph Image";

export type EspecIcone = {
  assetType: TipoIconeDerivado;
  arquivo: string;
  largura: number;
  altura: number;
  mimeType: "image/png" | "image/x-icon";
  /** ICO carrega várias resoluções no mesmo arquivo. */
  resolucoesIco?: number[];
  /** iOS desenha alfa como preto: esses precisam de fundo sólido. */
  exigeFundo: boolean;
  /** Logo inteira centralizada numa tela larga (não é ícone quadrado). */
  paisagem: boolean;
  descricao: string;
};

export const ICONES_DERIVADOS: readonly EspecIcone[] = [
  {
    assetType: "Favicon",
    arquivo: "favicon.ico",
    largura: 48,
    altura: 48,
    mimeType: "image/x-icon",
    resolucoesIco: [16, 32, 48],
    exigeFundo: false,
    paisagem: false,
    descricao: "Aba do navegador e favoritos (16, 32 e 48 px no mesmo .ico).",
  },
  {
    assetType: "Ícone 192x192",
    arquivo: "icone-192.png",
    largura: 192,
    altura: 192,
    mimeType: "image/png",
    exigeFundo: false,
    paisagem: false,
    descricao: "Ícone do manifesto: atalho na tela inicial do Android.",
  },
  {
    assetType: "Ícone 512x512",
    arquivo: "icone-512.png",
    largura: 512,
    altura: 512,
    mimeType: "image/png",
    exigeFundo: false,
    paisagem: false,
    descricao: "Ícone grande do manifesto: splash do app instalado.",
  },
  {
    assetType: "Apple Touch Icon",
    arquivo: "apple-touch-icon.png",
    largura: 180,
    altura: 180,
    mimeType: "image/png",
    exigeFundo: true,
    paisagem: false,
    descricao: "Atalho no iPhone. O iOS não respeita transparência: vai com fundo sólido.",
  },
  {
    assetType: "Preview image",
    arquivo: "preview-1200x675.png",
    largura: 1200,
    altura: 675,
    mimeType: "image/png",
    exigeFundo: true,
    paisagem: true,
    descricao: "Prévia 16:9 para WhatsApp e cards internos.",
  },
  {
    assetType: "Open Graph Image",
    arquivo: "open-graph-1200x630.png",
    largura: 1200,
    altura: 630,
    mimeType: "image/png",
    exigeFundo: true,
    paisagem: true,
    descricao: "og:image do site — o retângulo que aparece ao compartilhar o link.",
  },
];

export function especPorTipo(tipo: string): EspecIcone | undefined {
  return ICONES_DERIVADOS.find((i) => i.assetType === tipo);
}

/** Formatos que dá para usar como logo de origem. SVG entra rasterizado. */
export const MIMES_ORIGEM = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

export type OpcoesGeracao = {
  /** "#RRGGBB" ou null = fundo transparente onde o formato permitir. */
  fundo: string | null;
  /** Folga ao redor da logo, em % do lado do ícone (0 a 40). */
  margem: number;
  /** Corta a moldura vazia da logo antes de redimensionar. */
  recortar: boolean;
  /** Quais tipos gerar; vazio = todos. */
  tipos: TipoIconeDerivado[];
};

export const OPCOES_PADRAO: OpcoesGeracao = {
  fundo: null,
  margem: 10,
  recortar: true,
  tipos: [],
};

export const BRANCO = "#FFFFFF";
export const HEX = /^#[0-9a-fA-F]{6}$/;

export function saneiaOpcoes(entrada: unknown): OpcoesGeracao {
  const o = (entrada && typeof entrada === "object" ? entrada : {}) as Record<string, unknown>;
  const fundo = typeof o.fundo === "string" && HEX.test(o.fundo) ? o.fundo.toUpperCase() : null;
  const margemBruta = Number(o.margem);
  const margem = Number.isFinite(margemBruta)
    ? Math.min(40, Math.max(0, Math.round(margemBruta)))
    : OPCOES_PADRAO.margem;
  const recortar = o.recortar === undefined ? OPCOES_PADRAO.recortar : Boolean(o.recortar);
  const tipos = Array.isArray(o.tipos)
    ? (o.tipos.filter(
        (t): t is TipoIconeDerivado => typeof t === "string" && Boolean(especPorTipo(t)),
      ) as TipoIconeDerivado[])
    : [];
  return { fundo, margem, recortar, tipos };
}

/** Trecho pronto para colar no <head> do site do cliente. */
export function trechoHtml(base = "/"): string {
  const prefixo = base.endsWith("/") ? base : `${base}/`;
  return [
    `<link rel="icon" href="${prefixo}favicon.ico" sizes="any">`,
    `<link rel="icon" type="image/png" sizes="192x192" href="${prefixo}icone-192.png">`,
    `<link rel="apple-touch-icon" sizes="180x180" href="${prefixo}apple-touch-icon.png">`,
    `<link rel="manifest" href="${prefixo}site.webmanifest">`,
  ].join("\n");
}

/** site.webmanifest com os dois ícones do manifesto. */
export function manifesto(nome: string, corTema: string | null, base = "/"): string {
  const prefixo = base.endsWith("/") ? base : `${base}/`;
  return JSON.stringify(
    {
      name: nome,
      short_name: nome.slice(0, 12),
      icons: [
        { src: `${prefixo}icone-192.png`, sizes: "192x192", type: "image/png" },
        { src: `${prefixo}icone-512.png`, sizes: "512x512", type: "image/png" },
      ],
      theme_color: corTema && HEX.test(corTema) ? corTema.toUpperCase() : BRANCO,
      background_color: BRANCO,
      display: "standalone",
    },
    null,
    2,
  );
}
