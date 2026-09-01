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
