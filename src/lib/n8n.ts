/**
 * Ponte do painel com o n8n (n8n.avilaops.com).
 *
 * Toda integração com sistema de fora — Cloudflare, mail.avilaops.com, Google,
 * plataforma de lojas, e-mail transacional — mora em workflows do n8n. O app
 * é a tela e a fonte da verdade: chama o webhook, espera a resposta e grava
 * o resultado. Credenciais de terceiros ficam no cofre do n8n, nunca aqui.
 *
 * Os webhooks "Ávila OS — *" exigem o header `x-avila-webhook-token`; o valor
 * é o mesmo que o auth.avilaops.com usa para criar caixa de e-mail.
 */

const BASE = (process.env.N8N_WEBHOOK_BASE ?? "https://n8n.avilaops.com/webhook").replace(/\/+$/, "");

export class N8nIndisponivel extends Error {}

export function n8nConfigurado() {
  return Boolean(process.env.N8N_AVILA_OS_TOKEN?.trim());
}

export async function chamarN8n<T = Record<string, unknown>>(
  caminho: string,
  payload: Record<string, unknown>,
  opcoes?: { timeoutMs?: number },
): Promise<T> {
  const token = process.env.N8N_AVILA_OS_TOKEN?.trim();
  if (!token) {
    throw new N8nIndisponivel("N8N_AVILA_OS_TOKEN não configurado no servidor.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opcoes?.timeoutMs ?? 120_000);

  try {
    const resposta = await fetch(`${BASE}/${caminho.replace(/^\/+/, "")}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-avila-webhook-token": token,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });

    const texto = await resposta.text();
    let dados: unknown = null;
    try {
      dados = texto ? JSON.parse(texto) : null;
    } catch {
      dados = { erro: texto.slice(0, 300) };
    }

    if (!resposta.ok) {
      const detalhe =
        dados && typeof dados === "object" && "message" in dados
          ? String((dados as { message: unknown }).message)
          : texto.slice(0, 200);
      throw new N8nIndisponivel(
        `n8n respondeu HTTP ${resposta.status}${detalhe ? `: ${detalhe}` : ""}`,
      );
    }

    return (dados ?? {}) as T;
  } catch (erro) {
    if (erro instanceof N8nIndisponivel) throw erro;
    const mensagem =
      erro instanceof Error && erro.name === "AbortError"
        ? "o n8n demorou demais para responder"
        : erro instanceof Error
          ? erro.message
          : "falha desconhecida";
    throw new N8nIndisponivel(`Não foi possível falar com o n8n: ${mensagem}`);
  } finally {
    clearTimeout(timer);
  }
}
