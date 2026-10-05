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

const formatoData = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });
// expiresAt é um instante; o cliente lê no fuso de São Paulo. Sem o fuso, uma
// expiração entre 00:00 e 02:59 UTC apareceria no dia seguinte.
const formatoExpiracao = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

/** Formata na moeda da cobrança — USD não pode sair como R$ pro cliente. */
function formatarValor(valor: number, moeda: string): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda }).format(valor);
}

/** Corpo do e-mail nunca confia em texto vindo de cadastro de cliente. */
function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Estados em que a cobrança ainda aceita pagamento. É a mesma lista que o
 * portal do cliente usa (`portal-cliente.ts`): o que o cliente não veria como
 * pagável lá também não sai por e-mail ou WhatsApp.
 */
export const STATUS_COBRANCA_ATIVA = ["CREATED", "PENDING", "WAITING"];

/** Compara dinheiro em centavos: 60.1 + 39.9 em ponto flutuante não fecha 100. */
function centavos(valor: number | { toString(): string }): number {
  return Math.round(Number(valor) * 100);
}

/**
 * Não enviar meio de pagamento de fatura já paga/cancelada, de cobrança
 * cancelada/recusada/paga, de cobrança expirada nem de cobrança cujo valor não
 * é mais o que o cliente deve. O resumo "fatura" (sem link) é permitido
 * sempre, exceto de fatura cancelada.
 *
 * `saldo` é o `outstanding` de `core.receivables`: fatura de R$ 100 com R$ 60
 * já alocados deve R$ 40, e mandar o PIX de R$ 100 cobraria R$ 60 a mais. O
 * principal da cobrança (sem o juros do parcelamento, que não abate fatura)
 * tem que ser exatamente o saldo — a mesma regra que o portal usa para mostrar
 * a cobrança e que `gerarCobrancaDaFatura` usa para emitir. Sem saldo
 * conhecido (`null`) não há como garantir o valor: recusa.
 */
export function garantirEnviavel(
  invoice: { status: string; saldo: number | null },
  cobranca: {
    status: string;
    expiresAt: Date | null;
    amount: number | { toString(): string };
    interestAmount?: number | { toString(): string } | null;
  } | null,
  conteudo: ConteudoEnvio,
  agora: Date = new Date(),
): void {
  if (invoice.status === "CANCELLED") throw new CobrancaSemLink("Esta fatura foi cancelada.");
  if (conteudo === "fatura") return;
  if (invoice.status === "PAID") throw new CobrancaSemLink("Esta fatura já está paga; não há cobrança a enviar.");
  if (!cobranca) {
    throw new CobrancaSemLink("Esta fatura ainda não tem cobrança emitida; emita PIX, boleto ou PayPal, ou envie só o resumo.");
  }
  if (!STATUS_COBRANCA_ATIVA.includes(cobranca.status)) {
    throw new CobrancaSemLink(`Esta cobrança não aceita mais pagamento (${cobranca.status}); gere uma nova antes de enviar.`);
  }
  if (cobranca.expiresAt && cobranca.expiresAt.getTime() < agora.getTime()) {
    throw new CobrancaSemLink("Esta cobrança expirou; gere uma nova antes de enviar.");
  }
  if (invoice.saldo === null) {
    throw new CobrancaSemLink("Não foi possível conferir o saldo em aberto desta fatura; a cobrança não foi enviada.");
  }
  const principal = centavos(cobranca.amount) - centavos(cobranca.interestAmount ?? 0);
  if (principal !== centavos(invoice.saldo)) {
    throw new CobrancaSemLink(
      "O valor desta cobrança não confere com o saldo em aberto da fatura (há pagamento registrado). Concilie o saldo antes de enviar.",
    );
  }
}

export function montarEmailDaCobranca(
  cobranca: DadosCobranca | null,
  destinatario: Destinatario,
  descricao: string,
  conteudo: ConteudoEnvio = "cobranca",
  vencimento: Date | null = null,
  moeda: string = "BRL",
  valorFatura: number | null = null,
): EmailSaida {
  const metodo = metodoDoEnvio(cobranca, conteudo);
  const valor = cobranca ? formatarValor(Number(cobranca.amount), moeda) : "";
  // O resumo "fatura" é o valor da fatura; a cobrança de cartão parcelado tem
  // juros acima disso, e o cliente não pode ver dois valores conflitantes.
  const valorResumo = formatarValor(valorFatura ?? Number(cobranca?.amount ?? 0), moeda);
  const nome = escapar(destinatario.nome);
  const desc = escapar(descricao);

  const partes: string[] = [`<p>Olá, ${nome}.</p>`];

  if (conteudo === "fatura" || conteudo === "ambos") {
    partes.push(
      `<p>Fatura de <strong>${desc}</strong>: <strong>${valorResumo}</strong>` +
        `${vencimento ? `, com vencimento em ${formatoData.format(vencimento)}` : ""}.</p>`,
    );
  } else {
    partes.push(`<p>Segue a cobrança de <strong>${desc}</strong>, no valor de <strong>${valor}</strong>.</p>`);
  }

  // "fatura" é só o resumo, sem link de pagamento.
  if (cobranca && metodo) {
    if (metodo === "BOLETO") {
      if (!cobranca.boletoUrl) throw new CobrancaSemLink("Boleto sem link para enviar.");
      partes.push(`<p><a href="${escapar(cobranca.boletoUrl)}">Abrir o boleto</a><br>${escapar(cobranca.boletoUrl)}</p>`);
      if (cobranca.boletoBarcode) {
        partes.push(`<p>Linha digitável:<br><code>${escapar(cobranca.boletoBarcode)}</code></p>`);
      }
      if (cobranca.expiresAt) {
        partes.push(`<p>Vence em ${formatoExpiracao.format(cobranca.expiresAt)}.</p>`);
      }
    } else if (metodo === "PIX") {
      if (!cobranca.pixCopyPaste) throw new CobrancaSemLink("PIX sem copia-e-cola para enviar.");
      partes.push(`<p>Pague por PIX copia-e-cola:<br><code>${escapar(cobranca.pixCopyPaste)}</code></p>`);
      if (cobranca.expiresAt) {
        partes.push(`<p>Válido até ${formatoExpiracao.format(cobranca.expiresAt)}.</p>`);
      }
    } else {
      // CARD, PAYPAL e qualquer outro resolvem por página de checkout.
      if (!cobranca.checkoutUrl) throw new CobrancaSemLink("Cobrança sem link de pagamento para enviar.");
      partes.push(`<p><a href="${escapar(cobranca.checkoutUrl)}">Pagar agora</a><br>${escapar(cobranca.checkoutUrl)}</p>`);
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

/**
 * Método cujo meio de pagamento entra na mensagem, ou null quando é só o
 * resumo. Pedir link sem cobrança é erro de quem chamou, não mensagem vazia.
 */
function metodoDoEnvio(cobranca: DadosCobranca | null, conteudo: ConteudoEnvio): string | null {
  if (conteudo === "fatura") return null;
  if (!cobranca) throw new CobrancaSemLink("Esta fatura ainda não tem cobrança emitida.");
  return cobranca.method.toUpperCase();
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
 * O que se envia: uma cobrança emitida (com o meio de pagamento) ou, antes de
 * existir cobrança, a própria fatura — o resumo "fatura" não precisa de link.
 */
export type AlvoEnvio = { tipo: "cobranca"; id: string } | { tipo: "fatura"; id: string };

export type ResultadoEnvio = {
  enviado: boolean;
  destino: string;
  organizationId: string;
  invoiceId: string;
  chargeId: string | null;
};

const INCLUI_FATURA = {
  subscription: {
    include: {
      organization: { include: { profile: true, contacts: { where: { isPrimary: true } } } },
    },
  },
} as const;

/**
 * Saldo em aberto da fatura, da mesma visão que o portal e a emissão usam.
 * `null` quando a fatura não aparece em `core.receivables`.
 */
async function saldoEmAberto(invoiceId: string): Promise<number | null> {
  const [linha] = await prisma.$queryRaw<{ outstanding: unknown }[]>`
    SELECT outstanding FROM core.receivables WHERE source='INVOICE' AND source_id=${invoiceId}`;
  return linha ? Number(linha.outstanding) : null;
}

/**
 * Carrega fatura (com o saldo em aberto) e cobrança do alvo. Pela fatura, usa
 * a cobrança mais recente dela (se houver) — `garantirEnviavel` decide se ela
 * ainda serve.
 */
async function carregarAlvo(alvo: AlvoEnvio) {
  if (alvo.tipo === "cobranca") {
    const cobranca = await prisma.subscriptionCharge.findUnique({
      where: { id: alvo.id },
      include: { invoice: { include: INCLUI_FATURA } },
    });
    if (!cobranca) throw new CobrancaSemLink("Cobrança não encontrada.");
    const { invoice, ...resto } = cobranca;
    return { invoice: { ...invoice, saldo: await saldoEmAberto(invoice.id) }, cobranca: resto };
  }
  const invoice = await prisma.subscriptionInvoice.findUnique({
    where: { id: alvo.id },
    include: { ...INCLUI_FATURA, charges: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!invoice) throw new CobrancaSemLink("Fatura não encontrada.");
  const { charges, ...fatura } = invoice;
  return { invoice: { ...fatura, saldo: await saldoEmAberto(fatura.id) }, cobranca: charges[0] ?? null };
}

/**
 * Carrega o alvo, resolve o destinatário e envia por e-mail.
 *
 * `destinoTeste` existe para o modo de teste: enquanto o envio real não é
 * liberado, manda para um endereço do operador em vez do cliente.
 */
export async function enviarCobrancaPorEmail(
  alvo: AlvoEnvio,
  opcoes?: { destinoTeste?: string; conteudo?: ConteudoEnvio },
): Promise<ResultadoEnvio> {
  const { invoice, cobranca } = await carregarAlvo(alvo);

  const organizacao = invoice.subscription.organization;
  const emailReal = organizacao.profile?.email ?? organizacao.contacts[0]?.email ?? "";
  const nome = organizacao.profile?.ownerName ?? organizacao.contacts[0]?.name ?? organizacao.name;
  const destino = opcoes?.destinoTeste ?? emailReal;
  if (!destino) throw new CobrancaSemLink("Sem e-mail cadastrado para enviar a cobrança.");

  const conteudo = opcoes?.conteudo ?? "cobranca";
  garantirEnviavel(invoice, cobranca, conteudo);
  const descricao = `${invoice.subscription.description} · ${invoice.competence}`;
  const email = montarEmailDaCobranca(
    conteudo === "fatura" ? null : cobranca,
    { nome, email: destino },
    descricao,
    conteudo,
    invoice.dueDate ?? null,
    invoice.subscription.currency,
    Number(invoice.amount),
  );
  const enviado = await avisarPorEmail(email);
  return { enviado, destino, organizationId: organizacao.id, invoiceId: invoice.id, chargeId: cobranca?.id ?? null };
}

/**
 * Texto da cobrança para WhatsApp — puro, sem HTML, como o cliente lê no chat.
 */
export function montarWhatsappDaCobranca(
  cobranca: DadosCobranca | null,
  descricao: string,
  conteudo: ConteudoEnvio = "cobranca",
  vencimento: Date | null = null,
  moeda: string = "BRL",
  valorFatura: number | null = null,
): string {
  const metodo = metodoDoEnvio(cobranca, conteudo);
  const valor = cobranca ? formatarValor(Number(cobranca.amount), moeda) : "";
  const valorResumo = formatarValor(valorFatura ?? Number(cobranca?.amount ?? 0), moeda);
  const linhas: string[] = [];

  if (conteudo === "fatura" || conteudo === "ambos") {
    linhas.push(`Fatura *${descricao}* — ${valorResumo}${vencimento ? `, vence ${formatoData.format(vencimento)}` : ""}.`);
  } else {
    linhas.push(`Cobrança *${descricao}* — ${valor}.`);
  }

  if (cobranca && metodo) {
    if (metodo === "BOLETO") {
      if (!cobranca.boletoUrl) throw new CobrancaSemLink("Boleto sem link para enviar.");
      linhas.push(`Boleto: ${cobranca.boletoUrl}`);
      if (cobranca.boletoBarcode) linhas.push(`Linha digitável: ${cobranca.boletoBarcode}`);
      if (cobranca.expiresAt) linhas.push(`Vence em ${formatoExpiracao.format(cobranca.expiresAt)}.`);
    } else if (metodo === "PIX") {
      if (!cobranca.pixCopyPaste) throw new CobrancaSemLink("PIX sem copia-e-cola para enviar.");
      linhas.push(`PIX copia-e-cola:`, cobranca.pixCopyPaste);
      if (cobranca.expiresAt) linhas.push(`Válido até ${formatoExpiracao.format(cobranca.expiresAt)}.`);
    } else {
      if (!cobranca.checkoutUrl) throw new CobrancaSemLink("Cobrança sem link de pagamento para enviar.");
      linhas.push(`Pague aqui: ${cobranca.checkoutUrl}`);
    }
  }

  linhas.push(`— Avila Ops`);
  return linhas.join("\n");
}

/**
 * Carrega o alvo, resolve o número e envia por WhatsApp. `destinoTeste`
 * manda para um número do operador enquanto o envio real não é liberado.
 */
export async function enviarCobrancaPorWhatsapp(
  alvo: AlvoEnvio,
  opcoes?: { destinoTeste?: string; conteudo?: ConteudoEnvio },
): Promise<ResultadoEnvio> {
  const { invoice, cobranca } = await carregarAlvo(alvo);

  // Empresa importada só com contato (sem nome de dono) pode ter o telefone no
  // perfil, não num OrganizationContact — mesmo fallback que o e-mail usa.
  const organizacao = invoice.subscription.organization;
  const contato = organizacao.contacts[0];
  const numeroReal =
    contato?.whatsapp ?? contato?.phone ?? organizacao.profile?.whatsapp ?? organizacao.profile?.phone ?? "";
  const destino = opcoes?.destinoTeste ?? numeroReal;
  if (!destino) throw new CobrancaSemLink("Sem WhatsApp cadastrado para enviar a cobrança.");

  const conteudo = opcoes?.conteudo ?? "cobranca";
  garantirEnviavel(invoice, cobranca, conteudo);
  const descricao = `${invoice.subscription.description} · ${invoice.competence}`;
  const texto = montarWhatsappDaCobranca(
    conteudo === "fatura" ? null : cobranca,
    descricao,
    conteudo,
    invoice.dueDate ?? null,
    invoice.subscription.currency,
    Number(invoice.amount),
  );
  const enviado = await avisarPorWhatsapp({ to: destino, text: texto });
  return { enviado, destino, organizationId: organizacao.id, invoiceId: invoice.id, chargeId: cobranca?.id ?? null };
}
