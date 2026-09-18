/**
 * Gerador de ícones da marca: de uma logo só sai o conjunto inteiro
 * (favicon.ico, ícones do manifesto, Apple Touch Icon, OG/preview), como o
 * RealFaviconGenerator faz — mas gravando direto nos ativos do cliente, com
 * versão e procedência.
 *
 * Nada aqui inventa pixel: todo arquivo é um redimensionamento da logo que o
 * cliente enviou, e o registro guarda de qual ativo saiu. A lista de ícones e o
 * saneamento das opções ficam em `especificacoes.ts`, que a tela também importa.
 */
import sharp from "sharp";
import {
  BRANCO,
  ICONES_DERIVADOS,
  MIMES_ORIGEM,
  type EspecIcone,
  type OpcoesGeracao,
} from "./especificacoes";

export * from "./especificacoes";

export type IconeGerado = {
  spec: EspecIcone;
  buffer: Buffer;
  bytes: number;
};

function rgba(hex: string, alfa = 1) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
    alpha: alfa,
  };
}

/**
 * SVG é vetor: pedimos densidade alta para o maior ícone sair nítido em vez de
 * ser ampliado a partir dos 72 dpi padrão do libvips.
 */
function abrirOrigem(origem: Buffer, mimeType: string) {
  const svg = mimeType === "image/svg+xml";
  return sharp(origem, svg ? { density: 600 } : undefined);
}

/** Tira a moldura vazia (transparente ou de cor uniforme) em volta da logo. */
async function normalizarLogo(origem: Buffer, mimeType: string, recortar: boolean): Promise<Buffer> {
  if (!recortar) return abrirOrigem(origem, mimeType).ensureAlpha().png().toBuffer();
  try {
    return await abrirOrigem(origem, mimeType).ensureAlpha().trim({ threshold: 10 }).png().toBuffer();
  } catch {
    // trim() falha quando a imagem é de uma cor só; nesse caso vale a original.
    return abrirOrigem(origem, mimeType).ensureAlpha().png().toBuffer();
  }
}

async function desenhar(
  logo: Buffer,
  spec: EspecIcone,
  opcoes: OpcoesGeracao,
  lado: number,
): Promise<Buffer> {
  const largura = spec.paisagem ? Math.round((spec.largura / spec.altura) * lado) : lado;
  const altura = lado;
  const folga = Math.round((Math.min(largura, altura) * opcoes.margem) / 100);
  const interno = {
    largura: Math.max(1, largura - folga * 2),
    altura: Math.max(1, altura - folga * 2),
  };

  const transparente = { r: 0, g: 0, b: 0, alpha: 0 };
  const fundoDoIcone = opcoes.fundo
    ? rgba(opcoes.fundo)
    : spec.exigeFundo
      ? rgba(BRANCO)
      : transparente;

  const conteudo = await sharp(logo)
    .resize(interno.largura, interno.altura, { fit: "contain", background: transparente })
    .toBuffer();

  return sharp({
    create: { width: largura, height: altura, channels: 4, background: fundoDoIcone },
  })
    .composite([{ input: conteudo, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Monta um .ico com PNGs embutidos (aceito por todo navegador atual e pelo
 * Windows desde o Vista). O formato é um diretório de entradas de 16 bytes
 * seguido dos arquivos; largura/altura 0 significa 256.
 */
export function montarIco(imagens: { lado: number; png: Buffer }[]): Buffer {
  if (imagens.length === 0) throw new Error("Nenhuma imagem para o .ico.");
  const ordenadas = [...imagens].sort((a, b) => a.lado - b.lado);
  const cabecalho = Buffer.alloc(6);
  cabecalho.writeUInt16LE(0, 0); // reservado
  cabecalho.writeUInt16LE(1, 2); // 1 = ícone
  cabecalho.writeUInt16LE(ordenadas.length, 4);

  const diretorio = Buffer.alloc(16 * ordenadas.length);
  let deslocamento = cabecalho.length + diretorio.length;
  ordenadas.forEach((img, i) => {
    const base = i * 16;
    diretorio.writeUInt8(img.lado >= 256 ? 0 : img.lado, base);
    diretorio.writeUInt8(img.lado >= 256 ? 0 : img.lado, base + 1);
    diretorio.writeUInt8(0, base + 2); // paleta
    diretorio.writeUInt8(0, base + 3); // reservado
    diretorio.writeUInt16LE(1, base + 4); // planos
    diretorio.writeUInt16LE(32, base + 6); // bits por pixel
    diretorio.writeUInt32LE(img.png.length, base + 8);
    diretorio.writeUInt32LE(deslocamento, base + 12);
    deslocamento += img.png.length;
  });

  return Buffer.concat([cabecalho, diretorio, ...ordenadas.map((i) => i.png)]);
}

export async function gerarIcone(
  origem: Buffer,
  mimeOrigem: string,
  spec: EspecIcone,
  opcoes: OpcoesGeracao,
): Promise<IconeGerado> {
  const logo = await normalizarLogo(origem, mimeOrigem, opcoes.recortar);

  if (spec.resolucoesIco) {
    const imagens = await Promise.all(
      spec.resolucoesIco.map(async (lado) => ({
        lado,
        png: await desenhar(logo, spec, opcoes, lado),
      })),
    );
    const buffer = montarIco(imagens);
    return { spec, buffer, bytes: buffer.length };
  }

  const buffer = await desenhar(logo, spec, opcoes, spec.altura);
  return { spec, buffer, bytes: buffer.length };
}

export async function gerarIcones(
  origem: Buffer,
  mimeOrigem: string,
  opcoes: OpcoesGeracao,
): Promise<IconeGerado[]> {
  if (!MIMES_ORIGEM.has(mimeOrigem)) {
    throw new Error("A logo de origem precisa ser PNG, JPG, WEBP ou SVG.");
  }
  const escolhidos = opcoes.tipos.length
    ? ICONES_DERIVADOS.filter((i) => opcoes.tipos.includes(i.assetType))
    : ICONES_DERIVADOS;
  if (escolhidos.length === 0) throw new Error("Escolha ao menos um ícone para gerar.");

  const saida: IconeGerado[] = [];
  for (const spec of escolhidos) {
    saida.push(await gerarIcone(origem, mimeOrigem, spec, opcoes));
  }
  return saida;
}
