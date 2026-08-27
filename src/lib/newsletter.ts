import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendNewsletterEmail } from "@/lib/newsletter-mailer";

/**
 * Newsletter da Ávila Ops: base de contatos, composição e envio.
 *
 * Três regras que o resto do módulo assume:
 *
 * 1. O e-mail em minúsculo é a identidade do contato — dedupe, descadastro e
 *    entrega usam a mesma chave.
 * 2. Todo e-mail sai com link de descadastro. Se o HTML colado não trouxer o
 *    marcador `{{unsubscribe}}`, o rodapé é acrescentado antes de enviar.
 * 3. Envio é retomável: a chave única (campanha, e-mail) faz uma segunda
 *    tentativa continuar de onde parou em vez de mandar tudo de novo.
 */

export const UNSUBSCRIBE_PLACEHOLDER = "{{unsubscribe}}";

const EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}$/i;

/**
 * Caixas que respondem máquina, não pessoa. Elas entram numa varredura de
 * Gmail em volume muito maior que o de clientes reais, e uma newsletter que
 * cai em `no-reply@` só produz bounce e reputação ruim de remetente.
 */
const IGNORED_LOCAL_PARTS = [
  "no-reply",
  "noreply",
  "nao-responda",
  "naoresponda",
  "no_reply",
  "donotreply",
  "do-not-reply",
  "mailer-daemon",
  "postmaster",
  "bounce",
  "bounces",
  "notification",
  "notifications",
  "notificacao",
  "notificacoes",
  "alerta",
  "alertas",
  "alert",
  "alerts",
  "automatico",
  "automatica",
  "robot",
  "bot",
  "news",
  "newsletter",
  "marketing",
  "unsubscribe",
];

/** Remetentes de plataforma: nunca são cliente, sempre são ruído. */
const IGNORED_DOMAIN_FRAGMENTS = [
  "accounts.google",
  "google.com",
  "googlemail.com",
  "gmail-noreply",
  "facebookmail.com",
  "mail.instagram.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "notifications.",
  "bounces.",
  "mailchimp",
  "sendgrid",
  "mailgun",
  "resend.dev",
  "amazonses.com",
  "mercadolivre",
  "mercadolibre",
  "nubank",
  "itau",
  "bradesco",
  "santander",
  "efipay",
  "gerencianet",
  "paypal",
  "microsoft.com",
  "office365.com",
  "apple.com",
  "github.com",
  "vercel.com",
  "cloudflare.com",
  "hetzner",
  "godaddy",
  "registro.br",
  "uber.com",
  "ifood",
  "shopee",
  "amazon.com",
  "temu",
  "aliexpress",
];

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/^mailto:/i, "").toLowerCase();
  if (!trimmed || trimmed.length > 254) return null;
  return EMAIL_PATTERN.test(trimmed) ? trimmed : null;
}

export function isMachineAddress(email: string): boolean {
  const [localPart, domain = ""] = email.split("@");
  if (IGNORED_LOCAL_PARTS.some((part) => localPart === part || localPart.startsWith(`${part}-`) || localPart.startsWith(`${part}.`))) {
    return true;
  }
  return IGNORED_DOMAIN_FRAGMENTS.some((fragment) => domain.includes(fragment));
}

export type ContactEntry = {
  email: string;
  name?: string | null;
  company?: string | null;
  organizationId?: string | null;
};

/**
 * Aceita o que vier colado da tela: uma linha por contato, vírgula,
 * ponto e vírgula ou o formato `Nome <email@dominio>` do cliente de e-mail.
 */
export function parseContactList(raw: string): ContactEntry[] {
  const entries: ContactEntry[] = [];
  const seen = new Set<string>();

  for (const line of raw.split(/[\n\r;,]+/)) {
    const chunk = line.trim();
    if (!chunk) continue;

    const angled = chunk.match(/^(.*?)<([^>]+)>$/);
    const email = normalizeEmail(angled ? angled[2] : chunk);
    if (!email || seen.has(email)) continue;

    const name = angled ? angled[1].trim().replace(/^["']|["']$/g, "") : "";
    seen.add(email);
    entries.push({ email, name: name || null });
  }

  return entries;
}

export type ImportSummary = {
  created: number;
  updated: number;
  ignored: number;
  invalid: number;
  ignoredSamples: string[];
};

export async function importContacts(
  entries: ContactEntry[],
  options: { source: string; tags?: string[]; keepMachineAddresses?: boolean },
): Promise<ImportSummary> {
  const summary: ImportSummary = { created: 0, updated: 0, ignored: 0, invalid: 0, ignoredSamples: [] };
  const tags = (options.tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean);
  const handled = new Set<string>();

  for (const entry of entries) {
    const email = normalizeEmail(entry.email);
    if (!email) {
      summary.invalid += 1;
      continue;
    }
    if (handled.has(email)) continue;
    handled.add(email);

    if (!options.keepMachineAddresses && isMachineAddress(email)) {
      summary.ignored += 1;
      if (summary.ignoredSamples.length < 12) summary.ignoredSamples.push(email);
      continue;
    }

    const existing = await prisma.newsletterContact.findUnique({ where: { email } });
    const name = entry.name?.trim() || null;
    const company = entry.company?.trim() || null;

    if (!existing) {
      await prisma.newsletterContact.create({
        data: {
          email,
          name,
          company,
          organizationId: entry.organizationId ?? null,
          source: options.source,
          tags,
          lastSeenAt: new Date(),
        },
      });
      summary.created += 1;
      continue;
    }

    // Importar de novo nunca ressuscita quem se descadastrou: só completa
    // dados que faltavam e acrescenta etiquetas.
    await prisma.newsletterContact.update({
      where: { id: existing.id },
      data: {
        name: existing.name ?? name,
        company: existing.company ?? company,
        organizationId: existing.organizationId ?? entry.organizationId ?? null,
        tags: Array.from(new Set([...existing.tags, ...tags])),
        lastSeenAt: new Date(),
      },
    });
    summary.updated += 1;
  }

  return summary;
}

/**
 * Contatos que já existem no próprio painel: responsável da organização,
 * contatos cadastrados, solicitações de cadastro aprovadas e acessos de
 * cliente no portal. É a base “de casa”, sem depender do Gmail.
 */
export async function collectClientContacts(): Promise<ContactEntry[]> {
  const [contacts, profiles, requests, portalClients] = await Promise.all([
    prisma.organizationContact.findMany({
      where: { email: { not: null } },
      select: { email: true, name: true, organizationId: true, organization: { select: { name: true } } },
    }),
    prisma.organizationProfile.findMany({
      where: { email: { not: null } },
      select: { email: true, ownerName: true, organizationId: true, organization: { select: { name: true } } },
    }),
    prisma.clientRegistrationRequest.findMany({
      where: { status: "APPROVED" },
      select: { email: true, nome: true, empresa: true },
    }),
    prisma.adminIdentity.findMany({
      where: { role: "CLIENT" },
      select: { email: true, nome: true },
    }),
  ]);

  return [
    ...contacts.map((row) => ({
      email: row.email ?? "",
      name: row.name,
      company: row.organization?.name ?? null,
      organizationId: row.organizationId,
    })),
    ...profiles.map((row) => ({
      email: row.email ?? "",
      name: row.ownerName,
      company: row.organization?.name ?? null,
      organizationId: row.organizationId,
    })),
    ...requests.map((row) => ({ email: row.email, name: row.nome, company: row.empresa })),
    ...portalClients.map((row) => ({ email: row.email, name: row.nome })),
  ].filter((entry) => Boolean(normalizeEmail(entry.email)));
}

function unsubscribeSecret(): string {
  const secret = process.env.NEWSLETTER_SECRET?.trim() || process.env.APP_JWT_SECRET?.trim();
  if (!secret || secret.length < 16) {
    throw new Error("Configure NEWSLETTER_SECRET (ou APP_JWT_SECRET) para assinar os links de descadastro.");
  }
  return secret;
}

export function publicBaseUrl(): string {
  const base = process.env.NEWSLETTER_PUBLIC_BASE_URL?.trim() || process.env.APP_BASE_URL?.trim();
  return (base || "https://app.avilaops.com").replace(/\/+$/, "");
}

/** Token sem estado: `base64url(email).hmac`. Quem tem o link prova que o e-mail é dele. */
export function unsubscribeToken(email: string): string {
  const payload = Buffer.from(email.toLowerCase(), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", unsubscribeSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyUnsubscribeToken(token: unknown): string | null {
  if (typeof token !== "string" || token.length > 512) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = crypto.createHmac("sha256", unsubscribeSecret()).update(payload).digest("base64url");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(signature, "utf8");
  if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    return null;
  }

  try {
    return normalizeEmail(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function unsubscribeUrl(email: string): string {
  return `${publicBaseUrl()}/newsletter/descadastro?token=${unsubscribeToken(email)}`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

type RenderableCampaign = {
  subject: string;
  previewText: string | null;
  format: string;
  html: string | null;
  text: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  imageLinkUrl: string | null;
};

function shell(inner: string, campaign: RenderableCampaign, unsubscribe: string): string {
  const preheader = campaign.previewText ? escapeHtml(campaign.previewText) : "";
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${escapeHtml(campaign.subject)}</title></head>
<body style="margin:0;background:#f3f4f6;color:#17202a;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
<table role="presentation" width="100%" style="border-collapse:collapse;background:#f3f4f6"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" style="border-collapse:collapse;width:100%;max-width:600px;background:#ffffff">
<tr><td style="padding:32px 40px;border-top:5px solid #0b6b57">
<div style="color:#0b6b57;font-size:19px;font-weight:700;margin-bottom:24px">ÁVILA OPS</div>
${inner}
</td></tr>
<tr><td style="padding:24px 40px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.55">
Ávila Ops · Brasil · <a href="${unsubscribe}" style="color:#6b7280">Cancelar inscrição</a>
</td></tr>
</table></td></tr></table></body></html>`;
}

function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="color:#374151;font-size:16px;line-height:1.65;margin:0 0 16px">${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("\n");
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6])>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Monta o e-mail final de um destinatário. O link de descadastro entra no
 * lugar do marcador; se o autor não colocou marcador nenhum, o rodapé do
 * shell garante que ele exista mesmo assim.
 */
export function renderCampaign(
  campaign: RenderableCampaign,
  unsubscribe: string,
): { html: string; text: string } {
  if (campaign.format === "IMAGE") {
    const alt = escapeHtml(campaign.imageAlt ?? campaign.subject);
    const image = `<img src="${campaign.imageUrl ?? ""}" alt="${alt}" width="520" style="display:block;width:100%;max-width:520px;height:auto;border:0;border-radius:6px">`;
    const inner = campaign.imageLinkUrl
      ? `<a href="${campaign.imageLinkUrl}" style="text-decoration:none">${image}</a>`
      : image;
    const text = `${campaign.imageAlt ?? campaign.subject}\n${campaign.imageLinkUrl ?? ""}\n\nCancelar inscrição: ${unsubscribe}`;
    return { html: shell(inner, campaign, unsubscribe), text };
  }

  if (campaign.format === "TEXT") {
    const body = campaign.text ?? "";
    return {
      html: shell(textToHtml(body), campaign, unsubscribe),
      text: `${body}\n\n--\nCancelar inscrição: ${unsubscribe}`,
    };
  }

  const source = campaign.html ?? "";
  const html = source.includes(UNSUBSCRIBE_PLACEHOLDER)
    ? source.replaceAll(UNSUBSCRIBE_PLACEHOLDER, unsubscribe)
    : `${source}\n<p style="color:#6b7280;font-family:Arial,Helvetica,sans-serif;font-size:12px;text-align:center;padding:16px">Ávila Ops · <a href="${unsubscribe}" style="color:#6b7280">Cancelar inscrição</a></p>`;

  const plain = campaign.text?.trim() || htmlToText(html);
  return { html, text: `${plain}\n\n--\nCancelar inscrição: ${unsubscribe}` };
}

export async function audienceCount(tags: string[]): Promise<number> {
  return prisma.newsletterContact.count({ where: audienceWhere(tags) });
}

function audienceWhere(tags: string[]) {
  const normalized = tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);
  return {
    status: "SUBSCRIBED",
    ...(normalized.length > 0 ? { tags: { hasSome: normalized } } : {}),
  };
}

export type SendResult = {
  sent: number;
  failed: number;
  remaining: number;
  status: string;
  lastError: string | null;
};

/**
 * Envia (ou retoma) uma campanha, no máximo `batchSize` destinatários por
 * chamada. O corte existe para a tela não ficar pendurada num envio de mil
 * pessoas: a resposta diz quantos faltam e o botão continua de onde parou.
 */
export async function sendCampaign(
  campaignId: string,
  actorId: string,
  options: { batchSize?: number } = {},
): Promise<SendResult> {
  const batchSize = Math.min(Math.max(options.batchSize ?? 100, 1), 500);
  const campaign = await prisma.newsletterCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error("Campanha não encontrada.");
  if (campaign.status === "SENT") throw new Error("Esta campanha já foi enviada.");
  assertSendable(campaign);

  const recipients = await prisma.newsletterContact.findMany({
    where: audienceWhere(campaign.audienceTags),
    select: { id: true, email: true },
  });
  if (recipients.length === 0) throw new Error("Nenhum contato inscrito para este público.");

  await prisma.newsletterDelivery.createMany({
    data: recipients.map((contact) => ({
      campaignId: campaign.id,
      contactId: contact.id,
      email: contact.email,
    })),
    skipDuplicates: true,
  });

  await prisma.newsletterCampaign.update({
    where: { id: campaign.id },
    data: { status: "SENDING", recipientCount: recipients.length },
  });

  const pending = await prisma.newsletterDelivery.findMany({
    where: { campaignId: campaign.id, status: { in: ["PENDING", "FAILED"] } },
    take: batchSize,
    orderBy: { createdAt: "asc" },
  });

  let lastError: string | null = null;

  for (const delivery of pending) {
    // Um descadastro entre a criação da fila e o envio ainda vale: quem saiu
    // não recebe, mesmo já estando na lista congelada da campanha.
    const contact = await prisma.newsletterContact.findUnique({ where: { email: delivery.email } });
    if (contact && contact.status !== "SUBSCRIBED") {
      await prisma.newsletterDelivery.update({
        where: { id: delivery.id },
        data: { status: "SKIPPED", error: `Contato ${contact.status.toLowerCase()}` },
      });
      continue;
    }

    const link = unsubscribeUrl(delivery.email);
    const rendered = renderCampaign(campaign, link);

    try {
      const { providerId } = await sendNewsletterEmail({
        to: delivery.email,
        subject: campaign.subject,
        html: rendered.html,
        text: rendered.text,
        headers: {
          "List-Unsubscribe": `<${link}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      await prisma.newsletterDelivery.update({
        where: { id: delivery.id },
        data: { status: "SENT", providerId: providerId || null, error: null, sentAt: new Date() },
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Falha desconhecida no envio.";
      await prisma.newsletterDelivery.update({
        where: { id: delivery.id },
        data: { status: "FAILED", error: lastError.slice(0, 500) },
      });
    }
  }

  const [sent, failed, remaining] = await Promise.all([
    prisma.newsletterDelivery.count({ where: { campaignId: campaign.id, status: "SENT" } }),
    prisma.newsletterDelivery.count({ where: { campaignId: campaign.id, status: "FAILED" } }),
    prisma.newsletterDelivery.count({ where: { campaignId: campaign.id, status: "PENDING" } }),
  ]);

  const status = remaining > 0 ? "SENDING" : failed > 0 && sent === 0 ? "FAILED" : "SENT";
  await prisma.newsletterCampaign.update({
    where: { id: campaign.id },
    data: {
      status,
      sentCount: sent,
      failedCount: failed,
      sentAt: status === "SENT" ? new Date() : campaign.sentAt,
    },
  });

  await prisma.operationsAuditEvent.create({
    data: {
      actorId,
      action: "NEWSLETTER_CAMPAIGN_SENT",
      entityType: "NewsletterCampaign",
      entityId: campaign.id,
      metadata: { sent, failed, remaining, status },
    },
  });

  return { sent, failed, remaining, status, lastError };
}

export function assertSendable(campaign: {
  subject: string;
  format: string;
  html: string | null;
  text: string | null;
  imageUrl: string | null;
}) {
  if (!campaign.subject.trim()) throw new Error("Informe o assunto do e-mail.");
  if (campaign.format === "HTML" && !campaign.html?.trim()) throw new Error("Cole o HTML da campanha.");
  if (campaign.format === "TEXT" && !campaign.text?.trim()) throw new Error("Escreva a mensagem da campanha.");
  if (campaign.format === "IMAGE" && !campaign.imageUrl?.trim()) throw new Error("Envie a imagem da campanha.");
}

/** Envio avulso para conferir como o e-mail chega, sem tocar na fila real. */
export async function sendTestEmail(campaignId: string, to: string): Promise<void> {
  const campaign = await prisma.newsletterCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error("Campanha não encontrada.");
  assertSendable(campaign);

  const email = normalizeEmail(to);
  if (!email) throw new Error("Informe um e-mail válido para o teste.");

  const rendered = renderCampaign(campaign, unsubscribeUrl(email));
  await sendNewsletterEmail({
    to: email,
    subject: `[teste] ${campaign.subject}`,
    html: rendered.html,
    text: rendered.text,
  });
}

export async function unsubscribeByEmail(email: string, reason = "link"): Promise<boolean> {
  const contact = await prisma.newsletterContact.findUnique({ where: { email } });
  if (!contact) return false;
  if (contact.status === "UNSUBSCRIBED") return true;

  await prisma.newsletterContact.update({
    where: { id: contact.id },
    data: {
      status: "UNSUBSCRIBED",
      unsubscribedAt: new Date(),
      notes: contact.notes ?? `Descadastro por ${reason}`,
    },
  });
  return true;
}

export type NewsletterOverview = Awaited<ReturnType<typeof getNewsletterOverview>>;

export async function getNewsletterOverview() {
  const [subscribed, unsubscribed, total, tagRows, campaigns, contacts] = await Promise.all([
    prisma.newsletterContact.count({ where: { status: "SUBSCRIBED" } }),
    prisma.newsletterContact.count({ where: { status: "UNSUBSCRIBED" } }),
    prisma.newsletterContact.count(),
    prisma.newsletterContact.findMany({ where: { status: "SUBSCRIBED" }, select: { tags: true } }),
    prisma.newsletterCampaign.findMany({ orderBy: { createdAt: "desc" }, take: 25 }),
    prisma.newsletterContact.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        email: true,
        name: true,
        company: true,
        source: true,
        status: true,
        tags: true,
        createdAt: true,
      },
    }),
  ]);

  const tagCounts = new Map<string, number>();
  for (const row of tagRows) {
    for (const tag of row.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }

  return {
    metrics: { subscribed, unsubscribed, total, campaignsSent: campaigns.filter((c) => c.status === "SENT").length },
    tags: [...tagCounts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count),
    campaigns: campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      subject: campaign.subject,
      format: campaign.format,
      status: campaign.status,
      recipientCount: campaign.recipientCount,
      sentCount: campaign.sentCount,
      failedCount: campaign.failedCount,
      audienceTags: campaign.audienceTags,
      createdAt: campaign.createdAt.toISOString(),
      sentAt: campaign.sentAt?.toISOString() ?? null,
    })),
    contacts: contacts.map((contact) => ({
      ...contact,
      createdAt: contact.createdAt.toISOString(),
    })),
  };
}
