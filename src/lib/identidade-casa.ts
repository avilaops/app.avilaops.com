import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * A identidade da casa — o nome e o ícone que aparecem no topo de toda tela.
 *
 * Até 01/10/2026 o "A" azul era uma letra escrita no `AppShell`, e trocar a
 * marca era mexer em componente e publicar. Agora é configuração: quem é dono
 * entra pelo próprio cabeçalho e troca.
 *
 * Isto é a identidade da ÁVILA OPS, não a de um cliente. A marca do cliente é
 * `brands` / `OrganizationBrandAsset`, tem outro dono e outra tela. Misturar as
 * duas é o caminho para alguém publicar o logo de um cliente no painel da casa.
 */

const ID = "casa";

/** O que a tela e o cabeçalho precisam saber. Nunca carrega os bytes. */
export type IdentidadeDaCasa = {
  nome: string;
  /**
   * Reserva de texto para o `brand-mark`, que o CSS cobre com o símbolo
   * padrão da casa. Só aparece se a imagem não carregar.
   */
  inicial: string;
  temIcone: boolean;
  /** `/api/empresa/icone?v=<versão>`, ou nulo. A versão é o que fura o cache. */
  iconeUrl: string | null;
  iconeMime: string | null;
  atualizadoEm: Date | null;
};

const PADRAO: IdentidadeDaCasa = {
  nome: "Ávila Ops",
  inicial: "A",
  temIcone: false,
  iconeUrl: null,
  iconeMime: null,
  atualizadoEm: null,
};

/** Tipos que o navegador desenha e que não trazem script junto. */
export const MIMES_ACEITOS = ["image/png", "image/jpeg", "image/webp"] as const;

/**
 * 512 KB. Ícone de cabeçalho é desenhado com 32 pixels de lado: qualquer coisa
 * acima disso é desperdício que atravessa o banco em toda publicação da tela.
 *
 * SVG fica de fora da lista aceita de propósito. É XML, aceita `<script>` e
 * seria servido do mesmo domínio do painel — um logo trocado por quem tiver
 * acesso de dono viraria execução de código na sessão de todo mundo. Quem quer
 * SVG exporta em PNG.
 */
export const TAMANHO_MAXIMO_ICONE = 512 * 1024;

function inicialDe(nome: string): string {
  const limpo = nome.trim();
  return limpo ? limpo[0].toUpperCase() : "A";
}

/**
 * A identidade para desenhar. Nunca estoura: sem linha no banco, ou com o banco
 * fora do ar, devolve o padrão — o cabeçalho é moldura de TODA tela logada, e
 * derrubar o painel inteiro porque a tabela de marca não respondeu seria trocar
 * um detalhe visual por uma pane.
 */
export async function identidadeDaCasa(): Promise<IdentidadeDaCasa> {
  try {
    const linha = await prisma.identidadeDaCasa.findUnique({
      where: { id: ID },
      select: { nome: true, iconeMime: true, iconeVersao: true, updatedAt: true },
    });

    if (!linha) return PADRAO;

    const temIcone = Boolean(linha.iconeMime);
    return {
      nome: linha.nome,
      inicial: inicialDe(linha.nome),
      temIcone,
      iconeUrl: temIcone ? `/api/empresa/icone?v=${linha.iconeVersao ?? "1"}` : null,
      iconeMime: linha.iconeMime,
      atualizadoEm: linha.updatedAt,
    };
  } catch {
    return PADRAO;
  }
}

/** Os bytes, só para a rota que serve a imagem. */
export async function iconeDaCasa(): Promise<{ dados: Buffer; mime: string } | null> {
  const linha = await prisma.identidadeDaCasa.findUnique({
    where: { id: ID },
    select: { iconeDados: true, iconeMime: true },
  });

  if (!linha?.iconeDados || !linha.iconeMime) return null;
  return { dados: Buffer.from(linha.iconeDados), mime: linha.iconeMime };
}

export class IconeInvalido extends Error {}

/**
 * Guarda o ícone novo.
 *
 * O tipo é conferido pelos BYTES, não pelo que o navegador declarou: o
 * `content-type` de um upload é texto que quem envia escolhe, e aceitar a
 * palavra dele deixaria qualquer arquivo entrar com rótulo de imagem.
 */
export async function salvarIconeDaCasa(params: {
  dados: Buffer;
  mimeDeclarado: string;
  atorId: string;
}) {
  if (params.dados.byteLength === 0) throw new IconeInvalido("O arquivo veio vazio.");
  if (params.dados.byteLength > TAMANHO_MAXIMO_ICONE) {
    throw new IconeInvalido("O ícone precisa ter no máximo 512 KB.");
  }

  const mime = mimeReal(params.dados);
  if (!mime) {
    throw new IconeInvalido(
      "Formato não aceito. Use PNG, JPEG ou WebP — SVG não entra por ser executável no navegador.",
    );
  }
  if (params.mimeDeclarado && params.mimeDeclarado !== mime) {
    // Não é erro do usuário, é sinal de arquivo renomeado. Vale o aviso no log
    // e seguir pelo tipo real, que é o que o navegador vai obedecer.
    console.warn(`Ícone enviado como ${params.mimeDeclarado} e lido como ${mime}.`);
  }

  const versao = createHash("sha256").update(params.dados).digest("hex").slice(0, 12);

  // O Prisma tipa `Bytes` como `Uint8Array`, e um `Buffer` do Node não satisfaz
  // essa assinatura mesmo sendo um por baixo. A cópia explícita é o preço de
  // manter o tipo honesto em vez de calar o compilador com `as`.
  const bytes = new Uint8Array(params.dados);

  await prisma.identidadeDaCasa.upsert({
    where: { id: ID },
    update: { iconeDados: bytes, iconeMime: mime, iconeVersao: versao, atualizadoPor: params.atorId },
    create: { id: ID, iconeDados: bytes, iconeMime: mime, iconeVersao: versao, atualizadoPor: params.atorId },
  });

  return { mime, versao };
}

/** Tira o ícone do banco: o topo volta ao símbolo padrão da casa. */
export async function removerIconeDaCasa(atorId: string) {
  await prisma.identidadeDaCasa.upsert({
    where: { id: ID },
    update: { iconeDados: null, iconeMime: null, iconeVersao: null, atualizadoPor: atorId },
    create: { id: ID, atualizadoPor: atorId },
  });
}

export async function renomearCasa(nome: string, atorId: string) {
  const limpo = nome.trim();
  if (!limpo) throw new IconeInvalido("O nome não pode ficar vazio.");
  if (limpo.length > 60) throw new IconeInvalido("O nome precisa ter no máximo 60 caracteres.");

  await prisma.identidadeDaCasa.upsert({
    where: { id: ID },
    update: { nome: limpo, atualizadoPor: atorId },
    create: { id: ID, nome: limpo, atualizadoPor: atorId },
  });

  return limpo;
}

/**
 * O tipo real, lido da assinatura do arquivo.
 *
 * Exportada porque é a regra que decide o que entra, e errar aqui é aceitar
 * arquivo que o navegador vai interpretar de outro jeito.
 */
export function mimeReal(dados: Buffer): string | null {
  if (dados.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (dados.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (dados[0] === 0xff && dados[1] === 0xd8 && dados[2] === 0xff) return "image/jpeg";
  // WebP: "RIFF" .... "WEBP"
  if (dados.subarray(0, 4).toString("ascii") === "RIFF" && dados.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }

  return null;
}
