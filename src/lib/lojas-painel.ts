import type { Evidencia } from "@/lib/evidencia";
import type { LojaDaPlataforma, ProdutoDaLoja } from "@/lib/lojas-plataforma";

/**
 * O acompanhamento das lojas dos clientes, do lado de cá.
 *
 * A plataforma `lojas.avilaops.com` é dona do estado das lojas — quem está no
 * ar, quantos produtos, quantos pedidos. O Ávila OS é dono de quem é o
 * cliente. Nenhum dos dois sabe o suficiente sozinho: a plataforma não sabe
 * que a `brilhax` é da Brilhax Automotiva, e o OS não sabe que a vitrine dela
 * está no ar com o catálogo vazio.
 *
 * Este módulo cruza os dois e **não guarda cópia de nada**: é leitura a cada
 * carga de tela, pelo mesmo motivo que o painel do Mercado Pago não guarda —
 * cópia desatualizada de estado de negócio é pior que ausência dele.
 *
 * Tudo aqui é função pura, com `agora` recebido em vez de lido do relógio: a
 * regra que decide se um provisionamento travou tem que dar para testar sem
 * esperar um dia passar.
 */

export type ClienteVinculado = { id: string; nome: string };

/** O vínculo que o Ávila OS guarda: `OrganizationIntegration` de `lojas_avilaops`. */
export type VinculoDeLoja = { slug: string; cliente: ClienteVinculado };

export type LojaNoPainel = LojaDaPlataforma & {
  /** Nulo quando nenhuma ficha do OS reivindica esta loja. */
  cliente: ClienteVinculado | null;
};

export type Gravidade = "atencao" | "erro";

export type Alerta = {
  gravidade: Gravidade;
  titulo: string;
  /** O que fazer a respeito, não só o que está errado. */
  detalhe: string;
};

/** Horas desde um instante ISO, ou null quando a data não veio ou não é data. */
export function horasDesde(iso: string | null | undefined, agora: Date): number | null {
  if (!iso) return null;
  const instante = new Date(iso).getTime();
  if (Number.isNaN(instante)) return null;
  return Math.max(0, agora.getTime() - instante) / (60 * 60 * 1000);
}

/**
 * Junta a lista da plataforma com os vínculos do OS.
 *
 * A plataforma é a lista mestra: loja que existe lá aparece aqui mesmo sem
 * cliente vinculado — e aparecer é o ponto, porque loja sem dono no OS é
 * justamente o que ninguém descobre olhando só a ficha do cliente.
 */
export function juntarLojasComClientes(
  lojas: LojaDaPlataforma[],
  vinculos: VinculoDeLoja[],
): LojaNoPainel[] {
  const porSlug = new Map(vinculos.map((v) => [v.slug, v.cliente]));
  return lojas.map((loja) => ({ ...loja, cliente: porSlug.get(loja.slug) ?? null }));
}

/**
 * O que precisa de gente nesta loja.
 *
 * Só entra alerta com caminho: dizer "suspensa" sem dizer que o lojista está
 * sem vender hoje não faz ninguém agir. E só entra o que é mesmo problema —
 * loja recém-criada ainda provisionando é o fluxo normal, não pendência.
 */
export function alertasDaLoja(loja: LojaNoPainel, agora: Date = new Date()): Alerta[] {
  const alertas: Alerta[] = [];

  if (loja.status === "SUSPENSA") {
    alertas.push({
      gravidade: "erro",
      titulo: "Loja suspensa",
      detalhe: "A vitrine está fora do ar e o lojista não vende hoje. Ver a cobrança no Mercado Pago.",
    });
  }

  // Provisionamento é questão de segundos na plataforma. Um dia parado aí é
  // DNS que não propagou ou passo que falhou — não é fila.
  const provisionando = horasDesde(loja.criadoEm, agora);
  if (loja.status === "PROVISIONANDO" && provisionando !== null && provisionando > 24) {
    alertas.push({
      gravidade: "erro",
      titulo: "Provisionamento parado",
      detalhe: `Criada há ${Math.floor(provisionando / 24)} dia(s) e ainda configurando. Algum passo do provisionamento falhou.`,
    });
  }

  if (loja.status === "ATIVA" && loja._count.produtos === 0) {
    alertas.push({
      gravidade: "erro",
      titulo: "No ar sem catálogo",
      detalhe: "A loja responde no domínio e não tem nenhum produto. Quem entrar vê vitrine vazia.",
    });
  }

  if (loja.tentativasFalhas > 0) {
    alertas.push({
      gravidade: "atencao",
      titulo: `Cobrança recusada ${loja.tentativasFalhas}x`,
      detalhe: "O cartão da assinatura está recusando. Sem acerto, a varredura suspende a loja.",
    });
  }

  // Assinatura criada e nunca autorizada: o link do cartão foi mandado e
  // ninguém preencheu. Uma semana é o prazo em que ainda adianta cobrar.
  const criada = horasDesde(loja.criadoEm, agora);
  if (loja.assinaturaStatus === "pending" && criada !== null && criada > 7 * 24) {
    alertas.push({
      gravidade: "atencao",
      titulo: "Assinatura nunca autorizada",
      detalhe: "A assinatura foi criada mas o cartão nunca foi preenchido. Reenviar o link ao lojista.",
    });
  }

  if (!loja.cliente) {
    alertas.push({
      gravidade: "atencao",
      titulo: "Sem cliente vinculado",
      detalhe: "Esta loja existe na plataforma e nenhuma ficha do Ávila OS a reivindica.",
    });
  }

  return alertas;
}

export type ResumoLojas = {
  total: number;
  noAr: number;
  suspensas: number;
  configurando: number;
  canceladas: number;
  produtos: number;
  pedidos: number;
  semCliente: number;
  /** Lojas com ao menos um alerta de gravidade `erro`. */
  comProblema: number;
};

export function resumirLojas(lojas: LojaNoPainel[], agora: Date = new Date()): ResumoLojas {
  return {
    total: lojas.length,
    noAr: lojas.filter((l) => l.status === "ATIVA").length,
    suspensas: lojas.filter((l) => l.status === "SUSPENSA").length,
    configurando: lojas.filter((l) => l.status === "PROVISIONANDO").length,
    canceladas: lojas.filter((l) => l.status === "CANCELADA").length,
    produtos: lojas.reduce((soma, l) => soma + l._count.produtos, 0),
    pedidos: lojas.reduce((soma, l) => soma + l._count.pedidos, 0),
    semCliente: lojas.filter((l) => !l.cliente).length,
    comProblema: lojas.filter((l) => alertasDaLoja(l, agora).some((a) => a.gravidade === "erro")).length,
  };
}

/**
 * Plano contratado, no vocabulário da tabela de preços.
 *
 * Fica aqui e não no mapa de status da casa porque plano **não é status**: é
 * o produto que o cliente comprou, e "Loja Pro" é nome comercial, com a
 * maiúscula que o mapa de status proíbe de propósito nos seus rótulos.
 */
const PLANOS: Record<string, string> = {
  SITE: "Site",
  LOJA: "Loja",
  LOJA_PRO: "Loja Pro",
};

export function rotuloDoPlano(plano: string): string {
  return PLANOS[plano] ?? plano;
}

/** Endereço público da loja, na mesma regra que a plataforma usa. */
export function enderecoDaLoja(loja: { slug: string; dominioPrincipal: string | null }): string {
  return `https://${loja.dominioPrincipal ?? `${loja.slug}.lojas.avilaops.com`}`;
}

/* ─────────────────────────── catálogo ─────────────────────────── */

export type ResumoCatalogo = {
  total: number;
  ativos: number;
  inativos: number;
  semFoto: number;
  semPreco: number;
  prometendoEstoqueQueNaoTem: number;
  fotoNaoEDoItem: number;
};

/**
 * O que olhar num catálogo de outra pessoa.
 *
 * Cada número aqui é um defeito que o comprador vê e o lojista não: produto no
 * ar sem foto, sem preço, ou dizendo "em estoque" com zero unidade. Só conta
 * produto **ativo** — rascunho com campo faltando é trabalho em andamento, não
 * problema, e contá-lo encheria a tela de alarme que ninguém precisa resolver.
 */
export function resumirCatalogo(produtos: ProdutoDaLoja[]): ResumoCatalogo {
  const ativos = produtos.filter((p) => p.ativo);
  return {
    total: produtos.length,
    ativos: ativos.length,
    inativos: produtos.length - ativos.length,
    semFoto: ativos.filter((p) => p.imagens.length === 0).length,
    semPreco: ativos.filter((p) => p.precoCentavos <= 0).length,
    prometendoEstoqueQueNaoTem: ativos.filter(
      (p) => p.disponibilidade === "in_stock" && p.estoque !== null && p.estoque <= 0,
    ).length,
    fotoNaoEDoItem: ativos.filter((p) => p.imagens.length > 0 && p.imagemOrigem !== "propria").length,
  };
}

export type SituacaoProduto =
  | "todos"
  | "ativos"
  | "inativos"
  | "sem-foto"
  | "sem-preco"
  | "sem-estoque"
  | "foto-de-outro";

export const SITUACOES: { valor: SituacaoProduto; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "ativos", rotulo: "No ar" },
  { valor: "inativos", rotulo: "Fora do ar" },
  { valor: "sem-foto", rotulo: "Sem foto" },
  { valor: "sem-preco", rotulo: "Sem preço" },
  { valor: "sem-estoque", rotulo: "Estoque zerado" },
  { valor: "foto-de-outro", rotulo: "Foto de outro item" },
];

export function lerSituacao(valor: string | undefined): SituacaoProduto {
  return SITUACOES.some((s) => s.valor === valor) ? (valor as SituacaoProduto) : "todos";
}

/** Busca por nome, SKU ou marca — o que a pessoa tem na mão quando procura. */
export function filtrarProdutos(
  produtos: ProdutoDaLoja[],
  filtro: { busca?: string; situacao?: SituacaoProduto },
): ProdutoDaLoja[] {
  const busca = (filtro.busca ?? "").trim().toLowerCase();
  const situacao = filtro.situacao ?? "todos";

  return produtos.filter((p) => {
    if (busca) {
      const alvo = `${p.nome} ${p.sku ?? ""} ${p.marca ?? ""}`.toLowerCase();
      if (!alvo.includes(busca)) return false;
    }
    switch (situacao) {
      case "ativos":
        return p.ativo;
      case "inativos":
        return !p.ativo;
      case "sem-foto":
        return p.ativo && p.imagens.length === 0;
      case "sem-preco":
        return p.ativo && p.precoCentavos <= 0;
      case "sem-estoque":
        return p.ativo && p.disponibilidade === "in_stock" && p.estoque !== null && p.estoque <= 0;
      case "foto-de-outro":
        return p.ativo && p.imagens.length > 0 && p.imagemOrigem !== "propria";
      default:
        return true;
    }
  });
}

export const PRODUTOS_POR_PAGINA = 50;

/**
 * Uma página do catálogo. Loja de peças passa de mil itens; mandar tudo para o
 * navegador de uma vez é HTML de megabytes para ler trinta linhas.
 */
export function paginar<T>(itens: T[], pagina: number, porPagina = PRODUTOS_POR_PAGINA) {
  const paginas = Math.max(1, Math.ceil(itens.length / porPagina));
  const atual = Math.min(Math.max(1, Math.trunc(pagina) || 1), paginas);
  const inicio = (atual - 1) * porPagina;
  return { itens: itens.slice(inicio, inicio + porPagina), pagina: atual, paginas, total: itens.length };
}

/* ─────────────────────────── evidência ─────────────────────────── */

/**
 * A procedência de todo número desta área. A regra da casa é que número na
 * tela abre a evidência; aqui a fonte é sempre a mesma API, então a folha se
 * monta de um lugar só em vez de repetir origem em cada chamada.
 */
export function evidenciaDaPlataforma(
  rotulo: string,
  detalhes: { formula?: string; lidoEm: string; bruto?: unknown; caminho: string; funcao: string },
): Evidencia {
  return {
    rotulo,
    origem: `lojas.avilaops.com ${detalhes.caminho}`,
    funcao: `${detalhes.funcao} em src/lib/lojas-plataforma.ts`,
    formula: detalhes.formula,
    lidoEm: detalhes.lidoEm,
    bruto: detalhes.bruto,
    observacao:
      "Leitura direta da plataforma de lojas a cada carga desta tela. O Ávila OS não guarda cópia deste estado.",
  };
}
