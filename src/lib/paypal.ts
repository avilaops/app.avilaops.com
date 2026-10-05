/**
 * Cliente do PayPal, para receber de cliente de fora do Brasil.
 *
 * Existe porque a conta Stripe brasileira tem transação internacional e câmbio
 * restritos: cartão emitido fora do Brasil é recusado nela, mesmo cobrando em
 * real. Então o trilho internacional da casa é o PayPal, e o Mercado Pago
 * segue sendo o do Brasil (regra 13 do QUADRO.md, ajustada em 31/08/2026).
 *
 * Ambiente é decidido por variável, nunca por código: sandbox e produção são
 * mundos separados no PayPal, com credenciais e webhooks próprios, e trocar um
 * pelo outro sem perceber é como se descobre que a cobrança de verdade nunca
 * saiu.
 */

const BASES = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
} as const;

export class PayPalIndisponivel extends Error {}

function ambiente(): keyof typeof BASES {
  return process.env.PAYPAL_AMBIENTE?.trim().toLowerCase() === "live" ? "live" : "sandbox";
}

export function paypalConfigurado(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID?.trim() && process.env.PAYPAL_SECRET?.trim());
}

/**
 * Eventos que `src/app/api/webhooks/paypal/route.ts` trata como dinheiro. O
 * diagnóstico exige todos; mudar a lista lá exige mudar aqui.
 */
export const EVENTOS_DE_PAGAMENTO = [
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.DENIED",
  "PAYMENT.CAPTURE.REFUNDED",
] as const;
const EVENTOS_EXIGIDOS: readonly string[] = EVENTOS_DE_PAGAMENTO;

/**
 * Casas decimais que o PayPal aceita por moeda. JPY, HUF e TWD não têm
 * centavos na API (Orders v2): mandar "100.00" faz a ordem ser recusada.
 * Moeda fora desta lista não é aceita pela conta — melhor recusar aqui, com
 * mensagem clara, do que deixar o PayPal recusar com erro genérico.
 */
const CASAS_POR_MOEDA: Record<string, number> = {
  AUD: 2, BRL: 2, CAD: 2, CHF: 2, CNY: 2, CZK: 2, DKK: 2, EUR: 2, GBP: 2, HKD: 2,
  HUF: 0, ILS: 2, JPY: 0, MXN: 2, MYR: 2, NOK: 2, NZD: 2, PHP: 2, PLN: 2, SEK: 2,
  SGD: 2, THB: 2, TWD: 0, USD: 2,
};

export class MoedaNaoSuportadaPeloPaypal extends Error {}

/** Valor no formato do PayPal para a moeda, ou erro se a moeda não é aceita. */
export function valorPaypal(valor: number, moeda: string): string {
  const casas = CASAS_POR_MOEDA[moeda.toUpperCase()];
  if (casas === undefined) {
    throw new MoedaNaoSuportadaPeloPaypal(`O PayPal não cobra em ${moeda}.`);
  }
  if (casas === 0 && !Number.isInteger(valor)) {
    throw new MoedaNaoSuportadaPeloPaypal(`${moeda} não tem centavos no PayPal; o valor ${valor} precisa ser inteiro.`);
  }
  return valor.toFixed(casas);
}

export type DiagnosticoPaypal = {
  ambiente: "sandbox" | "live";
  configurado: boolean;
  oauthOk: boolean;
  webhookId: string | null;
  webhookUrl: string | null;
  eventos: string[];
  erro: string | null;
};

/**
 * Confere, sem depender de tráfego, se o PayPal está de pé: a credencial
 * autentica (OAuth) e o webhook existe na conta, apontando para a URL certa.
 *
 * É o mesmo check que antes só dava para fazer por SSH no servidor. Agora o
 * painel pergunta direto, e o operador vê verde/vermelho na tela.
 */
export async function diagnosticarWebhook(): Promise<DiagnosticoPaypal> {
  const amb = ambiente();
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim() || null;

  if (!paypalConfigurado()) {
    return { ambiente: amb, configurado: false, oauthOk: false, webhookId, webhookUrl: null, eventos: [], erro: "PAYPAL_CLIENT_ID/SECRET ausentes." };
  }

  // OAuth isolado: se a credencial autentica, oauthOk fica true mesmo que a
  // consulta do webhook falhe depois — senão o diagnóstico mandaria trocar uma
  // credencial que funciona quando o problema é só a configuração do webhook.
  try {
    await token();
  } catch (erro) {
    return { ambiente: amb, configurado: true, oauthOk: false, webhookId, webhookUrl: null, eventos: [], erro: erro instanceof Error ? erro.message : "Credencial PayPal inválida." };
  }

  if (!webhookId) {
    return { ambiente: amb, configurado: true, oauthOk: true, webhookId: null, webhookUrl: null, eventos: [], erro: "PAYPAL_WEBHOOK_ID ausente." };
  }

  try {
    const info = await chamar<{ url?: string; event_types?: { name: string }[] }>(
      `/v1/notifications/webhooks/${encodeURIComponent(webhookId)}`,
    );
    const url = info.url ?? null;
    const eventos = (info.event_types ?? []).map((e) => e.name);
    // Webhook que existe mas aponta pra URL velha, ou não assina evento de
    // pagamento, é a falha silenciosa que este diagnóstico tem que pegar.
    const esperada = (process.env.APP_URL ?? "https://app.avilaops.com").replace(/\/+$/, "") + "/api/webhooks/paypal";
    const urlConfere = Boolean(url && url.replace(/\/+$/, "") === esperada);
    // Cada evento que o handler trata precisa estar assinado: um webhook só com
    // DENIED nunca avisaria pagamento concluído nem reembolso.
    const faltando = eventos.includes("*") ? [] : EVENTOS_EXIGIDOS.filter((n) => !eventos.includes(n));
    let erro: string | null = null;
    if (!urlConfere) erro = `O webhook aponta para ${url ?? "lugar nenhum"}, não para ${esperada}.`;
    else if (faltando.length > 0) erro = `O webhook não assina: ${faltando.join(", ")}.`;
    return { ambiente: amb, configurado: true, oauthOk: true, webhookId, webhookUrl: url, eventos, erro };
  } catch (erro) {
    // OAuth deu certo; só a consulta do webhook falhou. Credencial segue ok.
    return { ambiente: amb, configurado: true, oauthOk: true, webhookId, webhookUrl: null, eventos: [], erro: `Falha ao consultar o webhook: ${erro instanceof Error ? erro.message : "erro"}` };
  }
}

/**
 * Token de acesso, pedido a cada chamada.
 *
 * O PayPal devolve um token de horas, e guardar em memória economizaria uma
 * ida. Não vale: o processo do Next reinicia a cada deploy, o volume aqui é de
 * poucas chamadas por dia, e cache de credencial é o tipo de coisa que falha
 * silenciosamente no dia em que a chave é trocada.
 */
async function token(): Promise<string> {
  const id = process.env.PAYPAL_CLIENT_ID?.trim();
  const segredo = process.env.PAYPAL_SECRET?.trim();
  if (!id || !segredo) {
    throw new PayPalIndisponivel("PAYPAL_CLIENT_ID e PAYPAL_SECRET não configurados.");
  }

  const resposta = await fetch(`${BASES[ambiente()]}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${id}:${segredo}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new PayPalIndisponivel(`PayPal recusou as credenciais: HTTP ${resposta.status} ${corpo.slice(0, 200)}`);
  }

  const dados = (await resposta.json()) as { access_token?: string };
  if (!dados.access_token) throw new PayPalIndisponivel("PayPal não devolveu token.");
  return dados.access_token;
}

async function chamar<T>(caminho: string, init?: RequestInit): Promise<T> {
  const acesso = await token();
  const resposta = await fetch(`${BASES[ambiente()]}${caminho}`, {
    ...init,
    headers: {
      authorization: `Bearer ${acesso}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const corpo = await resposta.text().catch(() => "");
  if (!resposta.ok) {
    throw new PayPalIndisponivel(`PayPal respondeu HTTP ${resposta.status} em ${caminho}: ${corpo.slice(0, 200)}`);
  }
  return (corpo ? JSON.parse(corpo) : {}) as T;
}

export async function criarOrdem(params: { valor: number; moeda?: string; descricao: string; referencia: string; retorno: string; cancelamento: string }) {
  const moeda = (params.moeda ?? "BRL").toUpperCase();
  const ordem = await chamar<{ id: string; status: string; links?: Array<{ rel: string; href: string }> }>("/v2/checkout/orders", {
    method: "POST",
    headers: { "PayPal-Request-Id": `avila-${params.referencia}` },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{
        reference_id: params.referencia,
        custom_id: params.referencia,
        invoice_id: params.referencia,
        description: params.descricao.slice(0, 127),
        amount: { currency_code: moeda, value: valorPaypal(params.valor, moeda) },
      }],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "Avila Ops",
            locale: "pt-BR",
            user_action: "PAY_NOW",
            return_url: params.retorno,
            cancel_url: params.cancelamento,
          },
        },
      },
    }),
  });
  const aprovacao = ordem.links?.find((link) => link.rel === "payer-action" || link.rel === "approve")?.href;
  if (!ordem.id || !aprovacao) throw new PayPalIndisponivel("PayPal não devolveu o link de aprovação.");
  return { id: ordem.id, status: ordem.status, aprovacao };
}

export async function capturarOrdem(id: string) {
  return chamar<{
    id: string;
    status: string;
    purchase_units?: Array<{ payments?: { captures?: Array<{ id: string; status: string; amount?: { value?: string; currency_code?: string } }> } }>;
  }>(`/v2/checkout/orders/${encodeURIComponent(id)}/capture`, { method: "POST", body: "{}" });
}

/**
 * Confirma com o PayPal que a notificação veio mesmo dele.
 *
 * O corpo do POST é aviso, não prova: chega por HTTP, é reenviado, pode vir
 * fora de ordem e pode ser forjado por quem conheça o formato. Aqui a
 * assinatura é verificada com a chave pública do próprio PayPal, o que exige
 * informar qual webhook gerou o evento.
 *
 * Sem `PAYPAL_WEBHOOK_ID` configurado devolve `false`: preferir recusar a
 * aceitar sem verificar. Dinheiro não entra por confiança em cabeçalho.
 */
export async function assinaturaConfere(
  cabecalhos: Headers,
  corpoBruto: string,
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
  if (!webhookId) return false;

  const obrigatorios = [
    "paypal-auth-algo",
    "paypal-cert-url",
    "paypal-transmission-id",
    "paypal-transmission-sig",
    "paypal-transmission-time",
  ];
  const valores = obrigatorios.map((h) => cabecalhos.get(h));
  if (valores.some((v) => !v)) return false;

  const [algo, certUrl, transmissionId, sig, time] = valores as string[];

  try {
    const r = await chamar<{ verification_status?: string }>("/v1/notifications/verify-webhook-signature", {
      method: "POST",
      body: JSON.stringify({
        auth_algo: algo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: sig,
        transmission_time: time,
        webhook_id: webhookId,
        // O PayPal exige o evento como objeto, e a assinatura foi feita sobre
        // o corpo cru: reserializar aqui mudaria bytes e derrubaria a
        // verificação por causa de espaço em branco.
        webhook_event: JSON.parse(corpoBruto),
      }),
    });
    return r.verification_status === "SUCCESS";
  } catch (erro) {
    console.error("[paypal] não consegui verificar a assinatura do webhook", erro);
    return false;
  }
}

/** Estado real de uma captura de pagamento, direto da API. */
export async function consultarCaptura(id: string) {
  return chamar<{
    id: string;
    status: string;
    amount?: { value?: string; currency_code?: string };
    custom_id?: string;
    invoice_id?: string;
    /** Instante em que o PayPal capturou — é o que vale como data do pagamento. */
    create_time?: string;
  }>(`/v2/payments/captures/${encodeURIComponent(id)}`);
}

/** Estado real de uma assinatura, direto da API. */
export async function consultarAssinatura(id: string) {
  return chamar<{
    id: string;
    status: string;
    custom_id?: string;
    plan_id?: string;
  }>(`/v1/billing/subscriptions/${encodeURIComponent(id)}`);
}
