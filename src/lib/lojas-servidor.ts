import {
  lerProduto,
  listarLojas,
  listarCatalogoResumido,
  lerLoja,
  lerRotinas,
  PlataformaIndisponivel,
  RespostaDaPlataforma,
  type FichaDaLoja,
  type FichaDoProduto,
  type LojaDaPlataforma,
  type ProdutoResumido,
  type SaudeDasRotinas,
} from "@/lib/lojas-plataforma";
import {
  juntarLojasComClientes,
  type ClienteCandidato,
  type LojaNoPainel,
  type VinculoDeLoja,
} from "@/lib/lojas-painel";
import { prisma } from "@/lib/prisma";

/**
 * A leitura das duas fontes da área de Lojas.
 *
 * Separado de `lojas-painel.ts` de propósito: lá ficam as regras, que são
 * puras e testáveis; aqui fica o que toca rede e banco. A tela chama daqui.
 *
 * Falha não derruba a tela — vira `falhas[]` e a tela diz o que não carregou,
 * como já faz o painel do Mercado Pago. Tela em branco esconde o que a outra
 * fonte tinha para contar; e inventar número para preencher o buraco é o que
 * esta casa não faz.
 */

export type PainelDeLojas = {
  lojas: LojaNoPainel[];
  /** A carteira, para sugerir o dono de uma loja órfã e para a escolha manual. */
  clientes: ClienteCandidato[];
  /**
   * O que roda sozinho na plataforma. `null` quando não deu para ler — e aí a
   * tela diz isso, em vez de mostrar oito rotinas saudáveis que ninguém viu.
   */
  rotinas: SaudeDasRotinas | null;
  /** O que não deu para ler, em linguagem de gente. */
  falhas: string[];
  /** `false` quando falta `LOJAS_ADMIN_TOKEN` — a tela explica em vez de zerar. */
  configurado: boolean;
  lidoEm: string;
};

function motivo(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

/** Os vínculos loja → cliente que o Ávila OS guarda na ficha. */
async function vinculos(): Promise<VinculoDeLoja[]> {
  const integracoes = await prisma.organizationIntegration.findMany({
    where: { provider: "lojas_avilaops", publicId: { not: null } },
    select: { publicId: true, organization: { select: { id: true, name: true } } },
  });
  return integracoes
    .filter((i): i is typeof i & { publicId: string } => Boolean(i.publicId))
    .map((i) => ({ slug: i.publicId, cliente: { id: i.organization.id, nome: i.organization.name } }));
}

export async function montarPainelDeLojas(): Promise<PainelDeLojas> {
  const falhas: string[] = [];
  let configurado = true;

  const [daPlataforma, doOs, clientes, rotinas] = await Promise.all([
    listarLojas().catch((erro) => {
      if (erro instanceof PlataformaIndisponivel) configurado = false;
      else falhas.push(`plataforma de lojas: ${motivo(erro)}`);
      return [] as LojaDaPlataforma[];
    }),
    vinculos().catch((erro) => {
      falhas.push(`vínculos de cliente: ${motivo(erro)}`);
      return [] as VinculoDeLoja[];
    }),
    prisma.organization
      .findMany({
        where: { status: { not: "ARCHIVED" } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, slug: true },
      })
      .catch((erro) => {
        falhas.push(`carteira de clientes: ${motivo(erro)}`);
        return [] as { id: string; name: string; slug: string }[];
      }),
    // A rota é nova (19/09/2026): uma plataforma ainda não atualizada responde
    // 404, e isso não é falha de leitura — é versão. Ficar sem o bloco de
    // rotinas é o certo ali; encher a tela de vermelho não seria.
    lerRotinas().catch((erro) => {
      const semARota = erro instanceof RespostaDaPlataforma && erro.status === 404;
      if (!semARota && !(erro instanceof PlataformaIndisponivel)) {
        falhas.push(`rotinas da plataforma: ${motivo(erro)}`);
      }
      return null;
    }),
  ]);

  return {
    lojas: juntarLojasComClientes(daPlataforma, doOs),
    clientes: clientes.map((c) => ({ id: c.id, nome: c.name, slug: c.slug })),
    rotinas,
    falhas,
    configurado,
    lidoEm: new Date().toISOString(),
  };
}

/**
 * O catálogo lido há pouco, por loja.
 *
 * Cada clique de filtro, de ordenação ou de página refazia a leitura inteira
 * na plataforma — que é a parte lenta. O catálogo de uma loja não muda a cada
 * segundo, e a tela diz quando foi lido: guardar por um minuto faz o filtro
 * responder na hora, e "Atualizar" força a leitura nova.
 *
 * Em memória do processo, e a promessa também fica guardada: dois pedidos
 * simultâneos da mesma loja fazem UMA chamada à plataforma, não duas.
 */
const VALIDADE_DO_CATALOGO_MS = 60_000;
type CatalogoGuardado = { lidoEm: number; produtos: Promise<ProdutoResumido[]> };
const catalogos = new Map<string, CatalogoGuardado>();

export function esquecerCatalogos() {
  catalogos.clear();
}

async function catalogoDaLoja(slug: string, forcar: boolean): Promise<{ produtos: ProdutoResumido[]; lidoEm: number }> {
  const agora = Date.now();
  const guardado = catalogos.get(slug);
  if (guardado && !forcar && agora - guardado.lidoEm < VALIDADE_DO_CATALOGO_MS) {
    return { produtos: await guardado.produtos, lidoEm: guardado.lidoEm };
  }
  const novo: CatalogoGuardado = { lidoEm: agora, produtos: listarCatalogoResumido(slug) };
  catalogos.set(slug, novo);
  try {
    return { produtos: await novo.produtos, lidoEm: agora };
  } catch (erro) {
    // Falha não fica guardada: a próxima abertura tenta de novo.
    if (catalogos.get(slug) === novo) catalogos.delete(slug);
    throw erro;
  }
}

export type DetalheDaLoja = {
  ficha: FichaDaLoja | null;
  produtos: ProdutoResumido[];
  /**
   * `false` quando o catálogo não pôde ser lido. A tela usa isto para NÃO
   * mostrar zero: lista vazia por falha e loja sem produto são coisas diferentes.
   */
  catalogoLido: boolean;
  /** Quando o catálogo mostrado foi lido na plataforma (pode ser de até um minuto atrás). */
  catalogoLidoEm: string | null;
  cliente: { id: string; nome: string } | null;
  /** A carteira, para dizer de quem é a loja quando ninguém reivindicou. */
  clientes: ClienteCandidato[];
  falhas: string[];
  configurado: boolean;
  lidoEm: string;
};

export async function montarDetalheDaLoja(slug: string, opcoes: { atualizar?: boolean } = {}): Promise<DetalheDaLoja> {
  const falhas: string[] = [];
  let configurado = true;
  let catalogoLido = true;
  let catalogoLidoEm: string | null = null;

  const [ficha, produtos, vinculo, clientes] = await Promise.all([
    lerLoja(slug).catch((erro) => {
      if (erro instanceof PlataformaIndisponivel) configurado = false;
      else falhas.push(`ficha da loja: ${motivo(erro)}`);
      return null;
    }),
    catalogoDaLoja(slug, Boolean(opcoes.atualizar))
      .then((lido) => {
        catalogoLidoEm = new Date(lido.lidoEm).toISOString();
        return lido.produtos;
      })
      .catch((erro) => {
        catalogoLido = false;
        // Sem `PlataformaIndisponivel` duas vezes: a ficha já reportou.
        if (!(erro instanceof PlataformaIndisponivel)) falhas.push(`catálogo: ${motivo(erro)}`);
        return [] as ProdutoResumido[];
      }),
    prisma.organizationIntegration
      .findFirst({
        where: { provider: "lojas_avilaops", publicId: slug },
        select: { organization: { select: { id: true, name: true } } },
      })
      .catch((erro) => {
        falhas.push(`vínculo de cliente: ${motivo(erro)}`);
        return null;
      }),
    prisma.organization
      .findMany({
        where: { status: { not: "ARCHIVED" } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, slug: true },
      })
      .catch(() => [] as { id: string; name: string; slug: string }[]),
  ]);

  return {
    ficha,
    produtos,
    catalogoLido,
    catalogoLidoEm,
    cliente: vinculo ? { id: vinculo.organization.id, nome: vinculo.organization.name } : null,
    clientes: clientes.map((c) => ({ id: c.id, nome: c.name, slug: c.slug })),
    falhas,
    configurado,
    lidoEm: new Date().toISOString(),
  };
}

export type DetalheDoProduto =
  | { estado: "ok"; ficha: FichaDoProduto; lidoEm: string }
  | { estado: "nao-encontrado" }
  | { estado: "falha"; motivo: string; configurado: boolean };

/** A ficha de um produto. Falha de leitura e produto inexistente são respostas diferentes. */
export async function montarDetalheDoProduto(slug: string, id: string): Promise<DetalheDoProduto> {
  try {
    return { estado: "ok", ficha: await lerProduto(slug, id), lidoEm: new Date().toISOString() };
  } catch (erro) {
    if (erro instanceof RespostaDaPlataforma && erro.status === 404) return { estado: "nao-encontrado" };
    return { estado: "falha", motivo: motivo(erro), configurado: !(erro instanceof PlataformaIndisponivel) };
  }
}
