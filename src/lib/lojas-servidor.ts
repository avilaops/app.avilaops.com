import {
  listarLojas,
  listarProdutosDaLoja,
  lerLoja,
  PlataformaIndisponivel,
  type FichaDaLoja,
  type LojaDaPlataforma,
  type ProdutoDaLoja,
} from "@/lib/lojas-plataforma";
import { juntarLojasComClientes, type LojaNoPainel, type VinculoDeLoja } from "@/lib/lojas-painel";
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

  const [daPlataforma, doOs] = await Promise.all([
    listarLojas().catch((erro) => {
      if (erro instanceof PlataformaIndisponivel) configurado = false;
      else falhas.push(`plataforma de lojas: ${motivo(erro)}`);
      return [] as LojaDaPlataforma[];
    }),
    vinculos().catch((erro) => {
      falhas.push(`vínculos de cliente: ${motivo(erro)}`);
      return [] as VinculoDeLoja[];
    }),
  ]);

  return {
    lojas: juntarLojasComClientes(daPlataforma, doOs),
    falhas,
    configurado,
    lidoEm: new Date().toISOString(),
  };
}

export type DetalheDaLoja = {
  ficha: FichaDaLoja | null;
  produtos: ProdutoDaLoja[];
  cliente: { id: string; nome: string } | null;
  falhas: string[];
  configurado: boolean;
  lidoEm: string;
};

export async function montarDetalheDaLoja(slug: string): Promise<DetalheDaLoja> {
  const falhas: string[] = [];
  let configurado = true;

  const [ficha, produtos, vinculo] = await Promise.all([
    lerLoja(slug).catch((erro) => {
      if (erro instanceof PlataformaIndisponivel) configurado = false;
      else falhas.push(`ficha da loja: ${motivo(erro)}`);
      return null;
    }),
    listarProdutosDaLoja(slug).catch((erro) => {
      // Sem `PlataformaIndisponivel` duas vezes: a ficha já reportou.
      if (!(erro instanceof PlataformaIndisponivel)) falhas.push(`catálogo: ${motivo(erro)}`);
      return [] as ProdutoDaLoja[];
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
  ]);

  return {
    ficha,
    produtos,
    cliente: vinculo ? { id: vinculo.organization.id, nome: vinculo.organization.name } : null,
    falhas,
    configurado,
    lidoEm: new Date().toISOString(),
  };
}
