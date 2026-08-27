/**
 * Saída de e-mail da newsletter.
 *
 * Dois motores, escolhidos por ambiente e nunca pelo código da tela:
 *
 * - `resend`  — HTTP direto, mesmo provedor que já envia a senha provisória.
 * - `n8n`     — webhook do n8n.avilaops.com, que fala com o SMTP próprio.
 *               A senha do SMTP fica no cofre do n8n e não neste projeto.
 *
 * Nenhum dos dois guarda lista: quem decide destinatário é o banco daqui.
 */

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
};

export type NewsletterDriver = "resend" | "n8n";

export function resolveDriver(): NewsletterDriver {
  const configured = process.env.NEWSLETTER_DRIVER?.trim().toLowerCase();
  if (configured === "resend" || configured === "n8n") return configured;
  if (process.env.RESEND_API_KEY?.trim()) return "resend";
  if (process.env.NEWSLETTER_WEBHOOK_URL?.trim()) return "n8n";
  throw new Error(
    "Nenhum motor de envio configurado: defina RESEND_API_KEY + EMAIL_FROM ou NEWSLETTER_WEBHOOK_URL.",
  );
}

/** O que a tela precisa mostrar antes de deixar alguém apertar “enviar”. */
export function deliveryReadiness(): { ready: boolean; driver: string; reason: string } {
  try {
    const driver = resolveDriver();
    if (driver === "resend" && !process.env.EMAIL_FROM?.trim()) {
      return { ready: false, driver, reason: "Configure EMAIL_FROM para o remetente." };
    }
    if (driver === "n8n" && !process.env.NEWSLETTER_WEBHOOK_SECRET?.trim()) {
      return { ready: false, driver, reason: "Configure NEWSLETTER_WEBHOOK_SECRET." };
    }
    return { ready: true, driver, reason: "" };
  } catch (error) {
    return {
      ready: false,
      driver: "nenhum",
      reason: error instanceof Error ? error.message : "Motor de envio indisponível.",
    };
  }
}

async function sendViaResend(email: OutgoingEmail): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    throw new Error("Configure RESEND_API_KEY e EMAIL_FROM para enviar a newsletter.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: email.to,
      subject: email.subject,
      html: email.html,
      ...(email.text ? { text: email.text } : {}),
      ...(email.headers ? { headers: email.headers } : {}),
    }),
  });

  const body = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(`Resend respondeu HTTP ${response.status}: ${body.slice(0, 300)}`);
  }

  try {
    const parsed = JSON.parse(body) as { id?: string };
    return parsed.id ?? "";
  } catch {
    return "";
  }
}

async function sendViaN8n(email: OutgoingEmail): Promise<string> {
  const url = process.env.NEWSLETTER_WEBHOOK_URL?.trim();
  const secret = process.env.NEWSLETTER_WEBHOOK_SECRET?.trim();
  if (!url || !secret) {
    throw new Error("Configure NEWSLETTER_WEBHOOK_URL e NEWSLETTER_WEBHOOK_SECRET.");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(email),
  });

  const body = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(`n8n respondeu HTTP ${response.status}: ${body.slice(0, 300)}`);
  }

  try {
    const parsed = JSON.parse(body) as { executionId?: string; id?: string };
    return String(parsed.executionId ?? parsed.id ?? "");
  } catch {
    return "";
  }
}

export async function sendNewsletterEmail(email: OutgoingEmail): Promise<{ providerId: string }> {
  const driver = resolveDriver();
  const providerId = driver === "resend" ? await sendViaResend(email) : await sendViaN8n(email);
  return { providerId };
}
