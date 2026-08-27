import { readFileSync } from "node:fs";

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
 * O nome no `.env.production` da raiz tem a grafia errada de origem (ACCES,
 * sem o segundo S). Ler os dois evita renomear em todos os projetos que já
 * dependem dele.
 */
function credencial(): { token: string; clientId: string } {
  const doAmbiente = process.env.MP_ACCESS_TOKEN ?? "";
  const clientIdAmbiente = process.env.MP_CLIENT_ID ?? "";
  if (doAmbiente) return { token: doAmbiente, clientId: clientIdAmbiente };

  // Em desenvolvimento o arquivo da raiz do monorepo é a fonte; em produção
  // as variáveis vêm do ambiente e este bloco nem roda.
  try {
    const bruto = readFileSync(new URL("../../../.env.production", import.meta.url), "utf8");
    const env = Object.fromEntries(
      bruto
        .split(/\r?\n/)
        .map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim()))
        .filter((m): m is RegExpExecArray => m !== null)
        .map((m) => [m[1], m[2].trim().replace(/^["']|["']$/g, "")]),
    );
    return {
      token: env.MERCADO_PAGO_ACCES_TOKEN_PROD ?? env.MP_ACCESS_TOKEN ?? "",
      clientId: clientIdAmbiente || (env.MERCADO_PAGO_CLIENT_ID ?? ""),
    };
  } catch {
    return { token: "", clientId: clientIdAmbiente };
  }
}

export function mercadoPagoConfigurado(): boolean {
  return Boolean(credencial().token);
}

async function chamar<T>(caminho: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { token } = credencial();
  if (!token) throw new MercadoPagoIndisponivel("Mercado Pago não configurado (MP_ACCESS_TOKEN).");

  const r = await fetch(BASE + caminho, {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
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

export const buscarConta = () =>
  chamar<Record<string, unknown>>("/users/me").then(
    (d): ContaMercadoPago => ({
      apelido: String(d.nickname ?? "—"),
      id: Number(d.id ?? 0),
      email: String(d.email ?? "—"),
      pais: String(d.site_id ?? "—"),
      tipo: String(d.user_type ?? "—"),
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
  return (d.results ?? []).map((p) => {
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
    };
  });
}

/**
 * Configuração de notificação da aplicação. Não existe API para **alterar**
 * isso — só o painel do Mercado Pago —, então aqui é diagnóstico: a tela avisa
 * quando a URL aponta para o lugar errado, que foi exatamente o que aconteceu
 * quando o cliente.avilaops.com foi desligado e ninguém percebeu.
 */
export async function buscarConfiguracaoWebhook(): Promise<ConfiguracaoWebhook | null> {
  const { clientId } = credencial();
  if (!clientId) return null;
  const d = await chamar<Record<string, unknown>>(`/applications/${clientId}`);
  return {
    aplicacao: String(d.name ?? "—"),
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
