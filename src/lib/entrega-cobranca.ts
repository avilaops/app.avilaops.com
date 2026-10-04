import { avisarPorEmail, type EmailSaida } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { avisarPorWhatsapp } from "@/lib/whatsapp-saida";

/**
 * Entrega de cobrança ao cliente (e-mail por enquanto; WhatsApp depende de um
 * canal de envio que o app ainda não tem).
 *
 * O envio é disparado pelo operador, não automático: quem decide mandar é a
 * pessoa, na tela. E começa com destino de teste — nada vai para cliente real
 * sem o operador escolher o envio de verdade.
 *
 * O núcleo (`montarEmailDaCobranca`) é puro de propósito: é onde mora a regra
 * de "como se paga cada método", e dá para testar sem banco nem n8n.
 */

export class CobrancaSemLink extends Error {}

/** Só o que o e-mail precisa saber da cobrança — mantém o núcleo testável. */
type DadosCobranca = {
  method: string;
  amount: number | { toString(): string };
  boletoUrl: string | null;
  boletoBarcode: string | null;
  pixCopyPaste: string | null;
  checkoutUrl: string | null;
  expiresAt: Date | null;
};

type Destinatario = { nome: string; email: string };

/** O que o operador manda: só o link de pagamento, só o resumo da fatura, ou os dois. */
export type ConteudoEnvio = "cobranca" | "fatura" | "ambos";

const formatoBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const formatoData = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

/** Corpo do e-mail nunca confia em texto vindo de cadastro de cliente. */
function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function montarEmailDaCobranca(
  cobranca: DadosCobranca,
  destinatario: Destinatario,
  descricao: string,
  conteudo: ConteudoEnvio = "cobranca",
  vencimento: Date | null = null,
): EmailSaida {
  const valor = formatoBRL.format(Number(cobranca.amount));
  const nome = escapar(destinatario.nome);
  const desc = escapar(descricao);

  const partes: string[] = [`<p>Olá, ${nome}.</p>`];

  if (conteudo === "fatura" || conteudo === "ambos") {
    partes.push(
      `<p>Fatura de <strong>${desc}</strong>: <strong>${valor}</strong>` +
        `${vencimento ? `, com vencimento em ${formatoData.format(vencimento)}` : ""}.</p>`,
    );
  } else {
    partes.push(`<p>Segue a cobrança de <strong>${desc}</strong>, no valor de <strong>${valor}</strong>.</p>`);
  }

  // "fatura" é só o resumo, sem link de pagamento.
  if (conteudo !== "fatura") {
    const metodo = cobranca.method.toUpperCase();
    if (metodo === "BOLETO") {
      if (!cobranca.boletoUrl) throw new CobrancaSemLink("Boleto sem link para enviar.");
      partes.push(`<p><a href="${escapar(cobranca.boletoUrl)}">Abrir o boleto</a></p>`);
      if (cobranca.boletoBarcode) {
        partes.push(`<p>Linha digitável:<br><code>${escapar(cobranca.boletoBarcode)}</code></p>`);
      }
      if (cobranca.expiresAt) {
        partes.push(`<p>Vence em ${formatoData.format(cobranca.expiresAt)}.</p>`);
      }
    } else if (metodo === "PIX") {
      if (!cobranca.pixCopyPaste) throw new CobrancaSemLink("PIX sem copia-e-cola para enviar.");
      partes.push(`<p>Pague por PIX copia-e-cola:<br><code>${escapar(cobranca.pixCopyPaste)}</code></p>`);
      if (cobranca.expiresAt) {
        partes.push(`<p>Válido até ${formatoData.format(cobranca.expiresAt)}.</p>`);
      }
    } else {
      // CARD, PAYPAL e qualquer outro resolvem por página de checkout.
      if (!cobranca.checkoutUrl) throw new CobrancaSemLink("Cobrança sem link de pagamento para enviar.");
      partes.push(`<p><a href="${escapar(cobranca.checkoutUrl)}">Pagar agora</a></p>`);
    }
  }

  partes.push(`<p>Qualquer dúvida, é só responder este e-mail.<br>— Avila Ops</p>`);

  const html = partes.join("\n");
  return {
    to: destinatario.email,
    subject: `${conteudo === "fatura" ? "Fatura" : "Cobrança"} ${descricao}`,
    html,
    text: semTags(html),
  };
}

/** Texto puro para o corpo alternativo (mesma ideia do email.ts). */
function semTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Carrega a cobrança, resolve o destinatário e envia.
 *
 * `destinoTeste` existe para o modo de teste: enquanto o envio real não é
 * liberado, manda para um endereço do operador em vez do cliente.
 */
export async function enviarCobrancaPorEmail(
  chargeId: string,
  opcoes?: { destinoTeste?: string; conteudo?: ConteudoEnvio },
): Promise<{ enviado: boolean; destino: string }> {
  const cobranca = await prisma.subscriptionCharge.findUnique({
    where: { id: chargeId },
    include: {
      invoice: {
        include: {
          subscription: {
            include: {
              organization: {
                include: { profile: true, contacts: { where: { isPrimary: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!cobranca) throw new CobrancaSemLink("Cobrança não encontrada.");

  const organizacao = cobranca.invoice.subscription.organization;
  const emailReal = organizacao.profile?.email ?? organizacao.contacts[0]?.email ?? "";
  const nome = organizacao.profile?.ownerName ?? organizacao.contacts[0]?.name ?? organizacao.name;
  const destino = opcoes?.destinoTeste ?? emailReal;
  if (!destino) throw new CobrancaSemLink("Sem e-mail cadastrado para enviar a cobrança.");

  const descricao = `${cobranca.invoice.subscription.description} · ${cobranca.invoice.competence}`;
  const email = montarEmailDaCobranca(
    cobranca,
    { nome, email: destino },
    descricao,
    opcoes?.conteudo ?? "cobranca",
    cobranca.invoice.dueDate ?? null,
  );
  const enviado = await avisarPorEmail(email);
  return { enviado, destino };
}

/**
 * Texto da cobrança para WhatsApp — puro, sem HTML, como o cliente lê no chat.
 */
export function montarWhatsappDaCobranca(
  cobranca: DadosCobranca,
  descricao: string,
  conteudo: ConteudoEnvio = "cobranca",
  vencimento: Date | null = null,
): string {
  const valor = formatoBRL.format(Number(cobranca.amount));
  const linhas: string[] = [];

  if (conteudo === "fatura" || conteudo === "ambos") {
    linhas.push(`Fatura *${descricao}* — ${valor}${vencimento ? `, vence ${formatoData.format(vencimento)}` : ""}.`);
  } else {
    linhas.push(`Cobrança *${descricao}* — ${valor}.`);
  }

  if (conteudo !== "fatura") {
    const metodo = cobranca.method.toUpperCase();
    if (metodo === "BOLETO") {
      if (!cobranca.boletoUrl) throw new CobrancaSemLink("Boleto sem link para enviar.");
      linhas.push(`Boleto: ${cobranca.boletoUrl}`);
      if (cobranca.boletoBarcode) linhas.push(`Linha digitável: ${cobranca.boletoBarcode}`);
      if (cobranca.expiresAt) linhas.push(`Vence em ${formatoData.format(cobranca.expiresAt)}.`);
    } else if (metodo === "PIX") {
      if (!cobranca.pixCopyPaste) throw new CobrancaSemLink("PIX sem copia-e-cola para enviar.");
      linhas.push(`PIX copia-e-cola:`, cobranca.pixCopyPaste);
      if (cobranca.expiresAt) linhas.push(`Válido até ${formatoData.format(cobranca.expiresAt)}.`);
    } else {
      if (!cobranca.checkoutUrl) throw new CobrancaSemLink("Cobrança sem link de pagamento para enviar.");
      linhas.push(`Pague aqui: ${cobranca.checkoutUrl}`);
    }
  }

  linhas.push(`— Avila Ops`);
  return linhas.join("\n");
}

/**
 * Carrega a cobrança, resolve o número e envia por WhatsApp. `destinoTeste`
 * manda para um número do operador enquanto o envio real não é liberado.
 */
export async function enviarCobrancaPorWhatsapp(
  chargeId: string,
  opcoes?: { destinoTeste?: string; conteudo?: ConteudoEnvio },
): Promise<{ enviado: boolean; destino: string }> {
  const cobranca = await prisma.subscriptionCharge.findUnique({
    where: { id: chargeId },
    include: {
      invoice: {
        include: {
          subscription: {
            include: {
              organization: { include: { contacts: { where: { isPrimary: true } } } },
            },
          },
        },
      },
    },
  });
  if (!cobranca) throw new CobrancaSemLink("Cobrança não encontrada.");

  const contato = cobranca.invoice.subscription.organization.contacts[0];
  const numeroReal = contato?.whatsapp ?? contato?.phone ?? "";
  const destino = opcoes?.destinoTeste ?? numeroReal;
  if (!destino) throw new CobrancaSemLink("Sem WhatsApp cadastrado para enviar a cobrança.");

  const descricao = `${cobranca.invoice.subscription.description} · ${cobranca.invoice.competence}`;
  const texto = montarWhatsappDaCobranca(
    cobranca,
    descricao,
    opcoes?.conteudo ?? "cobranca",
    cobranca.invoice.dueDate ?? null,
  );
  const enviado = await avisarPorWhatsapp({ to: destino, text: texto });
  return { enviado, destino };
}
