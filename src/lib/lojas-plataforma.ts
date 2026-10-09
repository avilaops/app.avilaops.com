/**
 * Cliente da API administrativa do lojas.avilaops.com.
 *
 * A regra de ouro deste módulo: **a plataforma de lojas é dona do estado do
 * negócio** (qual loja, qual plano, se está no ar) e o Mercado Pago é dono do
 * estado do dinheiro. O admin daqui lê os dois e cruza — mas nunca guarda
 * cópia de nenhum, e nunca decide sozinho.
 *
 * Por isso toda ação destrutiva (cancelar, pausar, reajustar) vai para a
 * plataforma em vez de ir direto ao Mercado Pago: só ela sabe suspender a
 * loja, gravar o histórico e avisar o lojista no mesmo movimento. Mexer no MP
 * pela porta dos fundos deixaria os dois lados discordando até a varredura do
 * dia seguinte.
 */
import type { PaginaDoCatalogo, ProdutoResumido } from "@/lib/lojas-catalogo";

const BASE = (process.env.LOJAS_API_URL ?? "https://lojas.avilaops.com").replace(/\/+$/, "");

export class PlataformaIndisponivel extends Error {}

/**
 * A plataforma respondeu, mas com erro. O status vem junto porque 404 e 500
 * pedem reações diferentes: rota que ainda não existe naquele deploy é versão,
 * não avaria, e a tela deve omitir o bloco em vez de acusar falha.
 */
export class RespostaDaPlataforma extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
  ) {
    super(mensagem);
  }
}

function token(): string {
  const t = process.env.LOJAS_ADMIN_TOKEN ?? "";
  if (!t) throw new PlataformaIndisponivel("LOJAS_ADMIN_TOKEN não configurado neste ambiente.");
  return t;
}

async function chamar<T>(caminho: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await fetch(BASE + caminho, {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${token()}`, "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  const texto = await r.text();
  let dados: unknown = null;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    dados = texto;
  }
  if (!r.ok) {
    const msg =
      dados && typeof dados === "object" && "erro" in dados
        ? String((dados as { erro?: unknown }).erro)
        : `lojas.avilaops.com respondeu ${r.status}`;
    throw new RespostaDaPlataforma(msg, r.status);
  }
  return dados as T;
}

export interface LojaDaPlataforma {
  slug: string;
  nome: string;
  plano: "SITE" | "LOJA" | "LOJA_PRO";
  status: "PROVISIONANDO" | "ATIVA" | "SUSPENSA" | "CANCELADA";
  dominioPrincipal: string | null;
  criadoEm: string;
  assinaturaId: string | null;
  assinaturaStatus: string;
  /**
   * Loja cobrada por fora da plataforma, ou da casa. Opcional porque a
   * plataforma só passou a mandar o campo em 08/10/2026: ausente, a tela não
   * afirma isenção nenhuma.
   */
  cobrancaIsenta?: boolean;
  ultimoPagamentoEm: string | null;
  setupPagoEm: string | null;
  suspensaEm: string | null;
  tentativasFalhas: number;
  loginEmail: string | null;
  emailContato: string | null;
  whatsapp: string | null;
  _count: { produtos: number; pedidos: number };
}

export const listarLojas = () => chamar<LojaDaPlataforma[]>("/api/admin/tenants");

/**
 * A ficha da loja. O endpoint devolve o tenant inteiro (sem os tokens de
 * gateway, que a plataforma nunca serve em claro); aqui declaramos só o que
 * esta tela lê. Campo novo lá não quebra nada aqui.
 */
export interface FichaDaLoja extends Omit<LojaDaPlataforma, "_count"> {
  segmento: string;
  dominios: string[];
  logoUrl: string | null;
  emailRemetente: string | null;
  cepOrigem: string | null;
  despachoDiasUteis: number;
  freteGratisAcima: number | null;
  /** Nulo quando o lojista nunca conectou o canal do Mercado Livre. */
  mlConectadoEm: string | null;
  mlNickname: string | null;
  /** Chave pública do Mercado Pago: presente significa gateway configurado. */
  mpPublicKey: string | null;
  atualizadoEm: string;
  _count: { produtos: number; pedidos: number; categorias: number };
}

/**
 * Produto do catálogo de uma loja.
 *
 * `imagemOrigem` vem junto de propósito: na plataforma ele declara se a foto é
 * do SKU exato (`propria`), de outro item da mesma família (`representativa`)
 * ou um desenho (`ilustracao`). Quem acompanha o catálogo de fora precisa ver
 * isso — foto plausível de produto errado gera compra errada e devolução.
 */
export type { ProdutoResumido } from "@/lib/lojas-catalogo";

export interface ProdutoDaLoja {
  id: string;
  slug: string;
  nome: string;
  marca: string | null;
  sku: string | null;
  precoCentavos: number;
  precoDeCentavos: number | null;
  imagens: string[];
  imagemOrigem: string;
  destaque: boolean;
  ativo: boolean;
  disponibilidade: string;
  estoque: number | null;
  atualizadoEm: string;
  criadoEm: string;
  categoria: { nome: string; slug: string } | null;
}

export const lerLoja = (slug: string) =>
  chamar<FichaDaLoja>(`/api/admin/tenants/${encodeURIComponent(slug)}`);

/**
 * Uma página do catálogo, com os totais. Quem busca, filtra, ordena, pagina e
 * conta é a plataforma, no banco dela; o painel não recebe o catálogo inteiro.
 * `query` é o que `queryDaPlataforma()` monta.
 */
export const consultarCatalogo = (slug: string, query: string) =>
  chamar<PaginaDoCatalogo>(`/api/admin/tenants/${encodeURIComponent(slug)}/produtos/consulta?${query}`);

/** Uma alteração de produto registrada pela própria plataforma (`HistoricoCatalogo`). */
export interface AlteracaoDeProduto {
  versao: number;
  /** Quem escreveu: `painel`, `importacao`, `api:…`, rotina. */
  origem: string;
  campos: string[];
  antes: Record<string, unknown>;
  depois: Record<string, unknown>;
  criadoEm: string;
}

export interface FichaDoProduto {
  produto: ProdutoDaLoja & { descricaoCurta: string | null; descricao: string | null; gtin: string | null; imagemFamilia: string | null; versaoCatalogo: number };
  /** A mesma linha calculada da lista: estoque das variações, estado, quantas variações. */
  resumo: ProdutoResumido | null;
  /** Todas as categorias da loja, inclusive as vazias. */
  categorias: { slug: string; nome: string }[];
  historico: AlteracaoDeProduto[];
}

export const lerProduto = (slug: string, id: string) =>
  chamar<FichaDoProduto>(`/api/admin/tenants/${encodeURIComponent(slug)}/produtos/${encodeURIComponent(id)}`);

/** O que o painel pode alterar num produto. Só vai o que mudou. */
export type EdicaoDeProduto = {
  /** Quem está editando: vai para a origem do histórico da plataforma. */
  autor: string;
  /** A versão que a pessoa estava olhando. Produto que mudou depois recusa com 409. */
  versao: number;
  ativo?: boolean;
  categoria?: string | null;
  precoCentavos?: number;
  precoDeCentavos?: number | null;
};

export type ProdutoEditado = {
  produto: { id: string; ativo: boolean; precoCentavos: number; precoDeCentavos: number | null; versaoCatalogo: number; categoria: { nome: string; slug: string } | null };
  /** Os campos que a plataforma gravou de fato. Vazio quando nada mudou. */
  gravados: string[];
};

export const editarProduto = (slug: string, id: string, edicao: EdicaoDeProduto) =>
  chamar<ProdutoEditado>(`/api/admin/tenants/${encodeURIComponent(slug)}/produtos/${encodeURIComponent(id)}`, { method: "PATCH", body: edicao });

/** A isenção de mensalidade de uma loja e o que a régua de inadimplência diria sem ela. */
export type SituacaoDaIsencao = {
  isenta: boolean;
  plano: string;
  statusDaLoja: string;
  assinaturaStatus: string;
  temAssinatura: boolean;
  suspensaoAutomatica: boolean;
  /** Motivo pelo qual a loja cairia na régua hoje, ou `null` se não cairia. */
  seNaoFosseIsenta: string | null;
};

export const lerIsencao = (slug: string) =>
  chamar<SituacaoDaIsencao>(`/api/admin/tenants/${encodeURIComponent(slug)}/isencao`);

export const mudarIsencao = (slug: string, isenta: boolean, cienteDaRegua: boolean) =>
  chamar<{ mudou: boolean; antes: SituacaoDaIsencao; depois: SituacaoDaIsencao }>(
    `/api/admin/tenants/${encodeURIComponent(slug)}/isencao`,
    { method: "POST", body: { isenta, ...(cienteDaRegua ? { cienteDaRegua: true } : {}) } },
  );

export const listarProdutosDaLoja = (slug: string) =>
  chamar<ProdutoDaLoja[]>(`/api/admin/tenants/${encodeURIComponent(slug)}/produtos`);

export type AcaoAssinatura =
  | { acao: "iniciar" }
  | { acao: "cancelar" }
  | { acao: "pausar" }
  | { acao: "retomar" }
  | { acao: "valor"; centavos: number };

export const agirNaAssinatura = (slug: string, acao: AcaoAssinatura) =>
  chamar<{ slug: string; status: string; assinaturaStatus: string; assinaturaId?: string | null; initPoint?: string | null }>(
    `/api/admin/tenants/${encodeURIComponent(slug)}/assinatura`,
    { method: "POST", body: acao },
  );

/** Roda a varredura de inadimplência agora, em vez de esperar as 6h da manhã. */
export const rodarVarreduraDeCobranca = () =>
  chamar<{ suspensas: string[]; sincronizadas: number; faturasNovas: number }>("/api/admin/cobranca/verificar", {
    method: "POST",
  });

// --- Rotinas ---------------------------------------------------------------

/**
 * Uma rotina agendada da plataforma, como ela se descreve.
 *
 * A plataforma se agenda sozinha desde 19/09/2026 (`docs/ROTINAS.md` lá). Quem
 * calcula atraso e saúde é ela, não esta tela: número que o Ávila OS recalcula
 * por fora é número que começa a discordar da fonte no primeiro fuso horário.
 */
export interface RotinaDaPlataforma {
  nome: string;
  /**
   * Duas ou três palavras. Opcional porque plataforma anterior a 19/09/2026
   * não manda o campo — e aí a tela cai na descrição, cortada, em vez de
   * mostrar linha sem título.
   */
  titulo?: string;
  descricao: string;
  /** Já em português: "a cada 5 min", "toda segunda às 07:00". */
  cadencia: string;
  proximaEm: string;
  ultimaEm: string | null;
  ultimaDuracaoMs: number | null;
  ultimoResumo: unknown;
  ultimoErro: string | null;
  falhasSeguidas: number;
  execucoes: number;
  executandoDesde: string | null;
  emAtraso: boolean;
  falhando: boolean;
  saudavel: boolean;
}

export interface SaudeDasRotinas {
  agendador: { ligado: boolean; passadaSegundos: number };
  saudavel: boolean;
  rotinas: RotinaDaPlataforma[];
  verificadoEm: string;
}

export const lerRotinas = () => chamar<SaudeDasRotinas>("/api/admin/rotinas");
