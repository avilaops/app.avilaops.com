/**
 * A marca que o Estúdio usa ao montar a peça.
 *
 * Peça sem cliente renderiza com a MARCA_PADRAO (a da casa). Peça com cliente
 * renderiza com a identidade dele, montada a partir do mesmo cadastro que a
 * ficha usa — nada é digitado duas vezes.
 *
 * A logo vira **data URI**: o worker abre o HTML no Chromium sem cookie
 * nenhum, e `/api/organizations/:id/brand-assets/:id/preview` exige sessão de
 * administrador. Uma URL ali daria 401 e a peça sairia sem logo. Congelar os
 * bytes no HTML também é o que mantém a promessa do snapshot: trocar a logo do
 * cliente depois não muda o que já está na fila.
 */
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { readOrganizationBrandAssetBuffer } from "@/lib/brand-asset-storage";
import { MARCA_PADRAO, type Marca } from "./templates";

/** Ordem de preferência da logo: a horizontal cai melhor no rodapé das peças. */
const TIPOS_DE_LOGO = ["Logo horizontal", "Logo principal", "Símbolo", "Logo vertical"];

const RASTERIZAVEL = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

/** Lado máximo da logo embutida: acima disso o HTML da peça fica pesado à toa. */
const LADO_MAX = 512;

function siteLimpo(url: string | null): string {
  if (!url) return "";
  return url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

/**
 * Cores dominantes da logo. É medição, não chute: reduz a imagem a uma paleta e
 * lê os pixels que sobraram, ignorando o que é transparente ou quase branco —
 * senão o fundo ganha de todas as cores da marca.
 */
export async function coresDaLogo(png: Buffer): Promise<{ primaria: string; destaque: string } | null> {
  // `nearest` de propósito: a interpolação padrão mistura pixels vizinhos e
  // inventa cores que não estão na logo — numa borda entre azul e branco ela
  // cria um azul claro que nunca foi da marca.
  const { data, info } = await sharp(png)
    .resize(64, 64, { fit: "inside", kernel: "nearest" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const baldes = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += info.channels) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 200) continue;
    const luz = (r * 299 + g * 587 + b * 114) / 1000;
    if (luz > 235 || luz < 12) continue; // fundo branco e preto puro não são a marca
    // Agrupa em faixas de 24 para tons vizinhos não virarem cores diferentes.
    const chave = `${Math.round(r / 24)}-${Math.round(g / 24)}-${Math.round(b / 24)}`;
    const atual = baldes.get(chave);
    if (atual) {
      atual.n += 1;
      atual.r += r;
      atual.g += g;
      atual.b += b;
    } else {
      baldes.set(chave, { n: 1, r, g, b });
    }
  }

  if (baldes.size === 0) return null;

  // A cor do balde é a média dos seus pixels, não o primeiro que apareceu:
  // o primeiro costuma ser um pixel de borda, já contaminado pelo fundo.
  const cores = [...baldes.values()]
    .map((b) => {
      const r = Math.round(b.r / b.n);
      const g = Math.round(b.g / b.n);
      const azul = Math.round(b.b / b.n);
      return { n: b.n, r, g, b: azul, luz: (r * 299 + g * 587 + azul * 114) / 1000 };
    })
    .sort((a, b) => b.n - a.n);

  const hex = (c: { r: number; g: number; b: number }) =>
    `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

  // Primária é a mais escura entre as dominantes (fundo da peça); destaque é a
  // mais frequente. Com uma cor só, as duas são a mesma.
  const dominantes = cores.slice(0, 4);
  const escura = [...dominantes].sort((a, b) => a.luz - b.luz)[0];
  return { primaria: hex(escura), destaque: hex(dominantes[0]) };
}

async function logoEmDataUri(bytes: Buffer, mimeType: string): Promise<{ uri: string; png: Buffer } | null> {
  try {
    const png = await sharp(bytes, mimeType === "image/svg+xml" ? { density: 600 } : undefined)
      .resize(LADO_MAX, LADO_MAX, { fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
    return { uri: `data:image/png;base64,${png.toString("base64")}`, png };
  } catch {
    return null;
  }
}

/**
 * Monta a marca do cliente. Cai para a da casa quando não há cliente, e mantém
 * os valores da casa campo a campo quando o cadastro do cliente não tem aquele
 * dado — é melhor uma peça com cor padrão do que uma peça sem cor.
 */
export async function marcaDoCliente(organizationId: string | null | undefined): Promise<Marca> {
  if (!organizationId) return MARCA_PADRAO;

  const organizacao = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, segment: true, siteUrl: true },
  });
  if (!organizacao) return MARCA_PADRAO;

  const marca: Marca = {
    ...MARCA_PADRAO,
    nome: organizacao.name.toUpperCase(),
    slogan: organizacao.segment ?? "",
    site: siteLimpo(organizacao.siteUrl),
    logoUrl: "",
  };

  const ativos = await prisma.organizationBrandAsset.findMany({
    where: { organizationId, isCurrent: true, assetType: { in: TIPOS_DE_LOGO } },
    select: { assetType: true, storageKey: true, mimeType: true },
  });

  const escolhido = TIPOS_DE_LOGO.map((tipo) =>
    ativos.find((a) => a.assetType === tipo && a.storageKey && a.mimeType && RASTERIZAVEL.has(a.mimeType)),
  ).find(Boolean);

  if (!escolhido?.storageKey) return { ...marca, logoUrl: MARCA_PADRAO.logoUrl };

  const bytes = await readOrganizationBrandAssetBuffer(escolhido.storageKey);
  if (!bytes) return { ...marca, logoUrl: MARCA_PADRAO.logoUrl };

  const logo = await logoEmDataUri(bytes, escolhido.mimeType!);
  if (!logo) return { ...marca, logoUrl: MARCA_PADRAO.logoUrl };

  const cores = await coresDaLogo(logo.png).catch(() => null);
  return {
    ...marca,
    logoUrl: logo.uri,
    corPrimaria: cores?.primaria ?? MARCA_PADRAO.corPrimaria,
    corDestaque: cores?.destaque ?? MARCA_PADRAO.corDestaque,
  };
}
