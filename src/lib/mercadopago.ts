import { obterCredencial } from "@/lib/credenciais";
import { renovarTokenSeVencendo } from "@/lib/mercadopago-oauth";
import { segredoDoWebhook } from "@/lib/mercadopago-assinatura";

/**
 * Cliente da API do Mercado Pago da Avila Ops — a conta que **cobra**, não a
 * dos lojistas (cada loja tem a sua, guardada cifrada no lojas.avilaops.com).
 *
 * É por aqui que a mensalidade das lojas é cobrada. O admin em
 * /financeiro/mercadopago existe porque não há painel de desenvolvedor no
 * lojas.avilaops.com: quem opera precisa ver e agir em algum lugar.
 */
const BASE = "https://api.mercadopago.com";

export class MercadoPagoIndisponivel extends Error {}

/**
 * A credencial vem do cofre, e o ambiente é a rede de segurança.
 *
 * Duas mudanças moram nesta função, e as duas são sobre a mesma pergunta:
 * **qual token está cobrando?**
 *
 * A primeira foi tirar, em 19/09/2026, o fallback que lia
 * `../docs/.env.production` do monorepo. Era conveniente e foi problema três
 * vezes — derrubou o build quando o arquivo mudou de pasta, mantinha segredo de
 * produção sendo lido de disco e, o pior, fazia o app cobrar com um token que o
 * ambiente dizia ser um e o arquivo dizia ser outro.
 *
 * A segunda é esta: a chave passa a ser lida por `obterCredencial()`, que
 * procura primeiro no cofre cifrado e só depois no `process.env`. É o que
 * permite trocar a conta que recebe **pela tela**, sem abrir arquivo de
 * ambiente e sem publicar de novo — e é o mesmo caminho que `meta.ts` já usava.
 * O fallback para o ambiente continua porque é ele que mantém a produção de pé
 * enquanto a chave não é migrada, e quando o banco não responde.
 */
async function credencial(): Promise<{ token: string; clientId: string }> {
  const [token, clientId] = await Promise.all([
    obterCredencial("MP_ACCESS_TOKEN"),
    obterCredencial("MP_CLIENT_ID"),
  ]);

  return { token: token?.trim() ?? "", clientId: clientId?.trim() ?? "" };
}

/**
 * Para onde o Mercado Pago avisa que esta cobrança mudou de estado.
 *
 * Vai no corpo de CADA cobrança nascida aqui, e existe por um conflito real: a
 * URL global da aplicação do Mercado Pago é uma só, e está (corretamente)
 * apontada para o `lojas.avilaops.com`, que recebe os eventos de assinatura das
 * lojas. Sem `notification_url`, a cobrança deste app depende dessa mesma URL —
 * ou seja, um dos dois sistemas fica sem ser avisado, e a fatura só fecha
 * quando alguém clica em sincronizar. Com o campo, cada cobrança carrega o
 * próprio endereço de volta e os dois convivem.
 *
 * O token da query entra quando existe: é a primeira barreira do webhook, antes
 * da assinatura `x-signature`.
 *
 * Devolve string VAZIA quando o endereço não é alcançável de fora — e aí o
 * campo nem vai no corpo. O Mercado Pago recusa `notification_url` com host
 * local, e recusa o PAGAMENTO INTEIRO por causa dela: com `APP_URL` apontando
 * para `localhost`, mandar o campo trocaria "em desenvolvimento o webhook não
 * chega", que é esperado, por "em desenvolvimento não se emite cobrança", que
 * é defeito.
 */
export async function urlDeNotificacao(): Promise<string> {
  const base = (process.env.APP_URL ?? "https://app.avilaops.com").replace(/\/+$/, "");

  let endereco: URL;
  try {
    endereco = new URL(`${base}/api/webhooks/mercadopago`);
  } catch {
    return "";
  }

  const local =
    endereco.protocol !== "https:" ||
    endereco.hostname === "localhost" ||
    endereco.hostname.endsWith(".local") ||
    // Sem ponto no nome não há DNS público: `app`, `web`, nomes de container.
    !endereco.hostname.includes(".") ||
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(endereco.hostname);
  if (local) return "";

  const token = (await obterCredencial("MP_WEBHOOK_TOKEN"))?.trim();
  if (token) endereco.searchParams.set("token", token);
  return endereco.toString();
}

export async function mercadoPagoConfigurado(): Promise<boolean> {
  return Boolean((await credencial()).token);
}

/**
 * Uma porta só para a API do Mercado Pago.
 *
 * Exportada (como `chamarMercadoPago`) desde que a mensalidade passou a ser
 * cobrada aqui: `mercadopago-cobranca.ts` precisa da mesma credencial, do
 * mesmo tratamento de erro e do mesmo timeout. Duas cópias divergiriam
 * justamente no tratamento de erro, que é o que ninguém testa.
 *
 * `idempotencia` existe por causa do `POST /v1/payments`: sem a chave, um
 * retry de rede depois do timeout cria a segunda cobrança para a mesma fatura.
 */
async function chamar<T>(
  caminho: string,
  init: { method?: string; body?: unknown; idempotencia?: string } = {},
): Promise<T> {
  // Token conectado por OAuth vence em 180 dias; perto disso, troca antes de usar.
  await renovarTokenSeVencendo();
  const { token } = await credencial();
  if (!token) {
    throw new MercadoPagoIndisponivel(
      "Mercado Pago não configurado: guarde o MP_ACCESS_TOKEN em Empresa › Credenciais › Financeiro.",
    );
  }

  const r = await fetch(BASE + caminho, {
    method: init.method ?? "GET",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.idempotencia ? { "X-Idempotency-Key": init.idempotencia } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(30_000),
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
      dados && typeof dados === "object" && "message" in dados
        ? String((dados as { message?: unknown }).message)
        : `Mercado Pago respondeu ${r.status}`;
    throw new Error(msg);
  }
  return dados as T;
}

export { chamar as chamarMercadoPago };

/* ── tipos ───────────────────────────────────────────────────────────────── */

export interface ContaMercadoPago {
  apelido: string;
  id: number;
  email: string;
  pais: string;
  tipo: string;
}

export type StatusAssinatura = "pending" | "authorized" | "paused" | "cancelled";

export interface Assinatura {
  id: string;
  loja: string | null;
  status: StatusAssinatura;
  motivo: string;
  pagador: string | null;
  valorCentavos: number;
  criadaEm: string;
  proximaCobranca: string | null;
  linkCadastroCartao: string | null;
}

export interface CobrancaAssinatura {
  id: string;
  status: string;
  statusPagamento: string | null;
  detalhe: string | null;
  valorCentavos: number;
  data: string | null;
}

export interface PagamentoRecebido {
  id: number;
  status: string;
  detalhe: string | null;
  valorCentavos: number;
  liquidoCentavos: number | null;
  meio: string | null;
  descricao: string | null;
  email: string | null;
  data: string;
  /** Quem recebeu. Quando não somos nós, o pagamento é compra nossa, não venda. */
  collectorId: number | null;
  payerId: number | null;
}

function idOuNulo(valor: unknown): number | null {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function participantes(p: Record<string, unknown>): { collectorId: number | null; payerId: number | null } {
  const collector = p.collector as { id?: unknown } | undefined;
  const payer = p.payer as { id?: unknown } | undefined;
  return {
    collectorId: idOuNulo(p.collector_id) ?? idOuNulo(collector?.id),
    payerId: idOuNulo(p.payer_id) ?? idOuNulo(payer?.id),
  };
}

let usuarioCache: { id: number; apelido: string; email: string | null } | null = null;

/** A conta dona do token, para saber de que lado de cada pagamento estamos. */
export async function usuarioDoToken(forcar = false): Promise<{ id: number; apelido: string; email: string | null }> {
  if (usuarioCache && !forcar) return usuarioCache;
  const d = await chamar<{ id?: unknown; nickname?: unknown; email?: unknown }>("/users/me");
  const id = idOuNulo(d.id);
  if (!id) throw new MercadoPagoIndisponivel("Mercado Pago não devolveu a conta do token.");
  usuarioCache = { id, apelido: String(d.nickname ?? ""), email: d.email ? String(d.email) : null };
  return usuarioCache;
}

export type DiagnosticoMercadoPago = {
  configurado: boolean;
  tokenOk: boolean;
  conta: string | null;
  webhookUrl: string | null;
  /** MP_WEBHOOK_SECRET presente: sem ele o webhook recusa tudo com 503. */
  segredoOk: boolean;
  erro: string | null;
};

/**
 * Confere se o Mercado Pago está de pé: o token autentica (/users/me) e qual é
 * a URL de notificação. Espelha o diagnóstico do PayPal para o painel.
 */
export async function diagnosticarMercadoPago(): Promise<DiagnosticoMercadoPago> {
  if (!(await mercadoPagoConfigurado())) {
    return { configurado: false, tokenOk: false, conta: null, webhookUrl: null, segredoOk: false, erro: "MP_ACCESS_TOKEN ausente." };
  }
  try {
    // Sem cache: um token revogado/trocado tem que aparecer no diagnóstico.
    const usuario = await usuarioDoToken(true);
    // O webhook (src/app/api/webhooks/mercadopago/route.ts) recusa toda
    // notificação com 503 sem o segredo: token bom e URL certa não bastam.
    const segredoOk = Boolean(await segredoDoWebhook());
    let bruto = "";
    try {
      bruto = await urlDeNotificacao();
    } catch {
      bruto = "";
    }
    // A URL de notificação carrega o MP_WEBHOOK_TOKEN no query: redigir antes de mostrar.
    let webhookUrl: string | null = null;
    if (bruto) {
      try {
        const u = new URL(bruto);
        u.search = "";
        webhookUrl = u.toString();
      } catch {
        webhookUrl = null;
      }
    }
    return {
      configurado: true,
      tokenOk: true,
      conta: usuario.apelido || String(usuario.id),
      webhookUrl,
      segredoOk,
      // Sem URL pública de notificação, ou sem o segredo que o webhook exige,
      // aviso de pagamento nunca vira baixa: isso é "com problema", não saudável.
      erro: !webhookUrl
        ? "URL de notificação ausente ou não pública (confira APP_URL)."
        : !segredoOk
          ? "MP_WEBHOOK_SECRET ausente: o webhook recusa toda notificação (503) e nenhuma baixa automática acontece."
          : null,
    };
  } catch (erro) {
    return {
      configurado: true,
      tokenOk: false,
      conta: null,
      webhookUrl: null,
      segredoOk: false,
      erro: erro instanceof Error ? erro.message : "Falha ao consultar o Mercado Pago.",
    };
  }
}

export interface ConfiguracaoWebhook {
  aplicacao: string;
  clientId: number;
  url: string | null;
  topicos: string[];
  ativa: boolean;
}

/* ── leitura ─────────────────────────────────────────────────────────────── */

const centavos = (v: unknown) => (typeof v === "number" ? Math.round(v * 100) : 0);

/**
 * Um pagamento cru da API (`/v1/payments/search` ou `/v1/payments/{id}`) no
 * formato da casa. Exportado porque o n8n manda o JSON cru para
 * `/api/integrations/mercadopago/importar`: a regra de leitura mora aqui, num
 * lugar só, e não em Code node.
 */
export function normalizarPagamento(p: Record<string, unknown>): PagamentoRecebido {
  const pagador = p.payer as { email?: string } | undefined;
  return {
    id: Number(p.id ?? 0),
    status: String(p.status ?? ""),
    detalhe: (p.status_detail as string) || null,
    valorCentavos: centavos(p.transaction_amount),
    liquidoCentavos: typeof p.net_received_amount === "number" ? centavos(p.net_received_amount) : null,
    meio: (p.payment_type_id as string) || null,
    descricao: (p.description as string) || null,
    email: pagador?.email ?? null,
    data: String(p.date_created ?? ""),
    ...participantes(p),
  };
}

export const buscarConta = () =>
  chamar<Record<string, unknown>>("/users/me").then(
    (d): ContaMercadoPago => ({
      apelido: String(d.nickname ?? "-"),
      id: Number(d.id ?? 0),
      email: String(d.email ?? "-"),
      pais: String(d.site_id ?? "-"),
      tipo: String(d.user_type ?? "-"),
    }),
  );

function paraAssinatura(a: Record<string, unknown>): Assinatura {
  const recorrencia = a.auto_recurring as { transaction_amount?: number } | undefined;
  return {
    id: String(a.id ?? ""),
    loja: (a.external_reference as string) || null,
    status: (a.status as StatusAssinatura) ?? "pending",
    motivo: String(a.reason ?? ""),
    pagador: (a.payer_email as string) || null,
    valorCentavos: centavos(recorrencia?.transaction_amount),
    criadaEm: String(a.date_created ?? ""),
    proximaCobranca: (a.next_payment_date as string) || null,
    linkCadastroCartao: (a.init_point as string) || null,
  };
}

/**
 * A busca de assinaturas exige `sort=campo:direcao`. O par
 * `sort=campo&criteria=desc`, que outras rotas do Mercado Pago aceitam, aqui
 * devolve 400 — custou um deploy para descobrir.
 */
export async function listarAssinaturas(filtro?: { status?: StatusAssinatura; limite?: number }) {
  const busca = new URLSearchParams({ limit: String(filtro?.limite ?? 50), sort: "date_created:desc" });
  if (filtro?.status) busca.set("status", filtro.status);
  const d = await chamar<{ results?: Array<Record<string, unknown>>; paging?: { total?: number } }>(
    `/preapproval/search?${busca}`,
  );
  return {
    total: d.paging?.total ?? d.results?.length ?? 0,
    assinaturas: (d.results ?? []).map(paraAssinatura),
  };
}

export const buscarAssinatura = (id: string) =>
  chamar<Record<string, unknown>>(`/preapproval/${encodeURIComponent(id)}`).then(paraAssinatura);

/** `limit` acima de 12 é recusado por este endpoint — não é o mesmo teto das outras buscas. */
export async function listarCobrancas(assinaturaId: string): Promise<CobrancaAssinatura[]> {
  const d = await chamar<{ results?: Array<Record<string, unknown>> }>(
    `/authorized_payments/search?preapproval_id=${encodeURIComponent(assinaturaId)}&limit=10&sort=date_created:desc`,
  );
  return (d.results ?? []).map((c) => {
    const pagamento = c.payment as { status?: string; status_detail?: string } | undefined;
    return {
      id: String(c.id ?? ""),
      status: String(c.status ?? ""),
      statusPagamento: pagamento?.status ?? null,
      detalhe: pagamento?.status_detail ?? null,
      valorCentavos: centavos(c.transaction_amount),
      data: (c.debit_date as string) ?? (c.date_created as string) ?? null,
    };
  });
}

export async function listarPagamentos(limite = 30): Promise<PagamentoRecebido[]> {
  const d = await chamar<{ results?: Array<Record<string, unknown>> }>(
    `/v1/payments/search?limit=${limite}&sort=date_created&criteria=desc`,
  );
  return (d.results ?? []).map(normalizarPagamento);
}

/**
 * Todos os pagamentos do período, paginando até o fim.
 *
 * `listarPagamentos` acima existe para a tela (as últimas N linhas); esta é
 * para o extrato, onde faltar uma linha é dinheiro que some do fluxo de caixa.
 * O limite por página do Mercado Pago é 50.
 */
export async function listarPagamentosDoPeriodo(desde: Date): Promise<PagamentoRecebido[]> {
  const porPagina = 50;
  const inicio = desde.toISOString();
  const todos: PagamentoRecebido[] = [];

  for (let offset = 0; ; offset += porPagina) {
    const d = await chamar<{ results?: Array<Record<string, unknown>>; paging?: { total?: number } }>(
      `/v1/payments/search?limit=${porPagina}&offset=${offset}` +
        `&sort=date_created&criteria=desc&range=date_created&begin_date=${encodeURIComponent(inicio)}&end_date=NOW`,
    );
    const pagina = d.results ?? [];
    for (const p of pagina) todos.push(normalizarPagamento(p));
    // Página incompleta é a última; o `total` do Mercado Pago nem sempre vem.
    if (pagina.length < porPagina) break;
    // Trava de segurança: 40 páginas são 2.000 pagamentos, muito acima do
    // volume da casa. Se estourar, é laço, não movimento.
    if (offset >= porPagina * 40) break;
  }

  return todos;
}

/**
 * Configuração de notificação da aplicação. Não existe API para **alterar**
 * isso — só o painel do Mercado Pago —, então aqui é diagnóstico: a tela avisa
 * quando a URL aponta para o lugar errado, que foi exatamente o que aconteceu
 * quando o cliente.avilaops.com foi desligado e ninguém percebeu.
 */
export async function buscarConfiguracaoWebhook(): Promise<ConfiguracaoWebhook | null> {
  const { clientId } = await credencial();
  if (!clientId) return null;
  const d = await chamar<Record<string, unknown>>(`/applications/${clientId}`);
  return {
    aplicacao: String(d.name ?? "-"),
    clientId: Number(d.id ?? 0),
    url: (d.notifications_callback_url as string) || null,
    topicos: (d.notifications_topics as string[]) ?? [],
    ativa: Boolean(d.active),
  };
}

/* ── ações ───────────────────────────────────────────────────────────────── */

export const cancelarAssinatura = (id: string) =>
  chamar<Record<string, unknown>>(`/preapproval/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: { status: "cancelled" },
  }).then(paraAssinatura);

export const pausarAssinatura = (id: string) =>
  chamar<Record<string, unknown>>(`/preapproval/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: { status: "paused" },
  }).then(paraAssinatura);

export const retomarAssinatura = (id: string) =>
  chamar<Record<string, unknown>>(`/preapproval/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: { status: "authorized" },
  }).then(paraAssinatura);

export const alterarValorAssinatura = (id: string, valorCentavos: number) =>
  chamar<Record<string, unknown>>(`/preapproval/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: { auto_recurring: { transaction_amount: valorCentavos / 100, currency_id: "BRL" } },
  }).then(paraAssinatura);

/** URL do Mercado Pago para conferir um pagamento na origem. */
export const linkDoPagamento = (id: number) =>
  `https://www.mercadopago.com.br/activities/detail/payment-${id}`;

/* ── cobrança avulsa e estorno ───────────────────────────────────────────── */

export interface LinkPagamento {
  id: string;
  titulo: string;
  valorCentavos: number;
  referencia: string | null;
  link: string;
  criadoEm: string;
}

/**
 * Link de pagamento avulso — o setup de R$ 497, um serviço fora do plano, uma
 * cobrança combinada no WhatsApp.
 *
 * Não confundir com a mensalidade: aqui é cobrança única, sem cartão salvo e
 * sem recorrência. O comprador escolhe PIX, cartão ou boleto na página do
 * Mercado Pago; nada disso passa por nós.
 */
export async function criarLinkPagamento(input: {
  titulo: string;
  valorCentavos: number;
  referencia?: string;
  emailPagador?: string;
}): Promise<LinkPagamento> {
  const notificacao = await urlDeNotificacao();
  const d = await chamar<Record<string, unknown>>("/checkout/preferences", {
    method: "POST",
    body: {
      items: [
        {
          title: input.titulo,
          quantity: 1,
          unit_price: input.valorCentavos / 100,
          currency_id: "BRL",
        },
      ],
      ...(input.referencia ? { external_reference: input.referencia } : {}),
      ...(input.emailPagador ? { payer: { email: input.emailPagador } } : {}),
      // Aparece na fatura do cartão de quem paga. Sem isso vira um nome
      // genérico do Mercado Pago e o cliente abre contestação sem saber o que é.
      statement_descriptor: "AVILAOPS",
      back_urls: { success: "https://app.avilaops.com/financeiro/mercadopago" },
      ...(notificacao ? { notification_url: notificacao } : {}),
    },
  });
  return {
    id: String(d.id ?? ""),
    titulo: input.titulo,
    valorCentavos: input.valorCentavos,
    referencia: input.referencia ?? null,
    link: String(d.init_point ?? ""),
    criadoEm: String(d.date_created ?? new Date().toISOString()),
  };
}

export async function listarLinksPagamento(limite = 20): Promise<LinkPagamento[]> {
  const d = await chamar<{ elements?: Array<Record<string, unknown>>; results?: Array<Record<string, unknown>> }>(
    `/checkout/preferences/search?limit=${limite}`,
  );
  // A busca devolve um resumo (`reason` e `price`), não o item completo da
  // preferência. É o bastante para a lista; o detalhe fica no próprio link.
  const lista = d.elements ?? d.results ?? [];
  return lista.map((p) => {
    const resumo = p as { id?: string; reason?: string; price?: number; external_reference?: string; init_point?: string; date_created?: string };
    return {
      id: String(resumo.id ?? ""),
      titulo: resumo.reason || "Cobrança",
      valorCentavos: centavos(resumo.price),
      referencia: resumo.external_reference || null,
      link: resumo.init_point ?? "",
      criadoEm: resumo.date_created ?? "",
    };
  });
}

/**
 * Estorno. Sem valor, devolve tudo; com valor, devolve em parte.
 *
 * É definitivo e o dinheiro sai da conta na hora — por isso a tela pede
 * confirmação digitada em vez de um clique só.
 */
export const estornarPagamento = (pagamentoId: number, valorCentavos?: number) =>
  chamar<Record<string, unknown>>(`/v1/payments/${pagamentoId}/refunds`, {
    method: "POST",
    body: valorCentavos ? { amount: valorCentavos / 100 } : {},
  });
