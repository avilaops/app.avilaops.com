/**
 * Refaz o conjunto de ícones do próprio Ávila OS a partir do símbolo da marca
 * (`public/marca/simbolo-avilaops.png`), usando o mesmo gerador que a tela de
 * marca do cliente usa — nenhum arquivo é desenhado à mão, todo ícone é um
 * recorte/redimensionamento do mestre, então trocar a marca é trocar um arquivo
 * e rodar isto de novo.
 *
 *   npm run marca:icones
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gerarIcone, type EspecIcone, type OpcoesGeracao } from "../src/lib/marca/icones";

/* `npm run marca:icones` roda na raiz do repositório. */
const PUBLICO = path.resolve(process.cwd(), "public");
const MESTRE = path.join(PUBLICO, "marca/simbolo-avilaops.png");

/**
 * Cada ícone tem a sua folga e o seu fundo, e o motivo é diferente em cada um:
 *
 * - favicon (.ico, 96 px e o .svg): quase sem folga, porque a 16 px cada pixel
 *   de tinta conta, e sem fundo — a aba do navegador tem tema claro e escuro.
 * - Apple Touch e ícones do manifesto: fundo branco sólido, porque o iOS pinta
 *   alfa de preto, e 10% de folga para o símbolo não encostar no recorte
 *   arredondado do iPhone.
 * - maskable: o Android recorta o ícone num círculo de 80% do lado. Um quadrado
 *   centralizado só cabe nesse círculo até ~56% do lado (56% × √2 ≈ 79%), daí a
 *   folga de 22% — é o ícone que parece pequeno de propósito.
 *
 * `assetType` aqui é só rótulo de log: `gerarIcone` recebe a especificação por
 * parâmetro, então o favicon de 96 px e o maskable existem sem precisar entrar
 * em `ICONES_DERIVADOS`, que é a lista que o dossiê do cliente mostra.
 */
type Derivado = { espec: EspecIcone; opcoes: OpcoesGeracao };

const SEM_FUNDO: Pick<OpcoesGeracao, "fundo" | "recortar" | "tipos"> = {
  fundo: null,
  recortar: true,
  tipos: [],
};
const BRANCO: Pick<OpcoesGeracao, "fundo" | "recortar" | "tipos"> = {
  fundo: "#FFFFFF",
  recortar: true,
  tipos: [],
};

const DERIVADOS: Derivado[] = [
  {
    espec: {
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
    opcoes: { ...SEM_FUNDO, margem: 2 },
  },
  {
    espec: {
      assetType: "Favicon",
      arquivo: "favicon-96x96.png",
      largura: 96,
      altura: 96,
      mimeType: "image/png",
      exigeFundo: false,
      paisagem: false,
      descricao: "Favicon em PNG para quem ignora o .ico.",
    },
    opcoes: { ...SEM_FUNDO, margem: 2 },
  },
  {
    espec: {
      assetType: "Apple Touch Icon",
      arquivo: "apple-touch-icon.png",
      largura: 180,
      altura: 180,
      mimeType: "image/png",
      exigeFundo: true,
      paisagem: false,
      descricao: "Atalho na tela de início do iPhone.",
    },
    opcoes: { ...BRANCO, margem: 10 },
  },
  {
    espec: {
      assetType: "Ícone 192x192",
      arquivo: "web-app-manifest-192x192.png",
      largura: 192,
      altura: 192,
      mimeType: "image/png",
      exigeFundo: true,
      paisagem: false,
      descricao: "Ícone do manifesto (purpose any).",
    },
    opcoes: { ...BRANCO, margem: 10 },
  },
  {
    espec: {
      assetType: "Ícone 512x512",
      arquivo: "web-app-manifest-512x512.png",
      largura: 512,
      altura: 512,
      mimeType: "image/png",
      exigeFundo: true,
      paisagem: false,
      descricao: "Ícone grande do manifesto e splash do app instalado.",
    },
    opcoes: { ...BRANCO, margem: 10 },
  },
  {
    espec: {
      assetType: "Ícone 512x512",
      arquivo: "web-app-manifest-maskable-512x512.png",
      largura: 512,
      altura: 512,
      mimeType: "image/png",
      exigeFundo: true,
      paisagem: false,
      descricao: "Ícone maskable: símbolo dentro da zona segura do Android.",
    },
    opcoes: { ...BRANCO, margem: 22 },
  },
];

/**
 * O favicon.svg é o mesmo PNG embutido num SVG — é o que o RealFaviconGenerator
 * fazia no arquivo anterior. A marca só existe em bitmap; um "vetor" redesenhado
 * à mão seria outro desenho, não esta marca.
 */
function svgComPngEmbutido(png: Buffer, lado: number): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 ${lado} ${lado}">`,
    `<image width="${lado}" height="${lado}" href="data:image/png;base64,${png.toString("base64")}"/>`,
    `</svg>`,
    ``,
  ].join("");
}

async function principal() {
  const mestre = await readFile(MESTRE);

  for (const { espec, opcoes } of DERIVADOS) {
    const gerado = await gerarIcone(mestre, "image/png", espec, opcoes);
    await writeFile(path.join(PUBLICO, espec.arquivo), gerado.buffer);
    console.log(`${espec.arquivo.padEnd(38)} ${String(gerado.bytes).padStart(7)} bytes`);
  }

  const paraSvg = await gerarIcone(
    mestre,
    "image/png",
    {
      assetType: "Favicon",
      arquivo: "favicon.svg",
      largura: 192,
      altura: 192,
      mimeType: "image/png",
      exigeFundo: false,
      paisagem: false,
      descricao: "Bitmap embutido no favicon vetorial.",
    },
    { ...SEM_FUNDO, margem: 2 },
  );
  const svg = svgComPngEmbutido(paraSvg.buffer, 192);
  await writeFile(path.join(PUBLICO, "favicon.svg"), svg);
  console.log(`${"favicon.svg".padEnd(38)} ${String(Buffer.byteLength(svg)).padStart(7)} bytes`);
}

principal().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
