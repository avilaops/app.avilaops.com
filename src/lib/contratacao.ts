import { prisma } from "@/lib/prisma";
import { garantirAcessoCliente, vincularContaAOrganizacao, slugLivreDeOrganizacao } from "@/lib/acesso-cliente";
import { garantirFatura, criarCobrancaDaFatura } from "@/lib/assinaturas";
import { marcarEtapa } from "@/lib/onboarding-etapas";
import { classifyCpfCnpj } from "@/lib/cpf-cnpj";

/**
 * Porta única de contratação: é aqui que um produto vira cliente pagante.
 *
 * Cada produto tem a tela de contratação com a cara dele (o estúdio de cinco
 * etapas das Lojas, o webmail, o Comandeiro), mas todos passam por aqui para
 * criar conta, assinatura e primeira fatura. Sem isso, cada produto inventa a
 * própria cobrança e a casa acaba com quatro conciliações, quatro réguas e
 * quatro webhooks para manter de pé.
 *
 * **Idempotência é o coração deste arquivo.** Autoatendimento erra sozinho, às
 * duas da manhã, sem ninguém no meio para segurar: o mesmo pedido chegando
 * duas vezes (clique duplo, retentativa de rede, reenvio do produto) não pode
 * criar duas empresas, duas assinaturas nem duas cobranças. A chave é o par
 * `productKey` + `productTenantId`, que já é único no banco.
 *
 * O que este arquivo **não** faz, de propósito: provisionar. Loja, caixa de
 * e-mail e restaurante só nascem depois do pagamento confirmado, e quem
 * dispara isso é o webhook. Provisionar antes de receber é como entregar a
 * mercadoria na porta e depois perguntar se o cartão passou.
 */

export type PedidoDeContratacao = {
  /** LOJA | MAIL | COMANDEIRO | SITE. O domínio fica de fora por decisão. */
  produto: string;
  /** Identificador do produto do lado de lá: slug da loja, domínio, tenant. */
  tenant: string;
  /** Slug do plano em `ServicePlan`, para o preço não vir digitado por fora. */
  plano: string;
  empresa: string;
  responsavel: string;
  email: string;
  /**
   * Endereço pessoal de quem contrata, fora dos domínios que a casa hospeda.
   * É por ele que a pessoa recupera o acesso: o e-mail de login costuma ser a
   * caixa profissional que nós mesmos entregamos.
   */
  emailRecuperacao: string;
  telefone?: string | null;
  cpfCnpj?: string | null;
};

export type ResultadoContratacao = {
  novo: boolean;
  organizationId: string;
  subscriptionId: string;
  invoiceId: string;
  contaCriada: boolean;
  senhaProvisoria: string | null;
  valorCents: number;
  cobranca: {
    metodo: string;
    pixCopiaECola: string | null;
    pixQrBase64: string | null;
    expiraEm: string | null;
  } | null;
};

export class ContratacaoInvalida extends Error {}

const PRODUTOS = new Set(["LOJA", "MAIL", "COMANDEIRO", "SITE"]);

/**
 * Contrata, ou devolve o que já foi contratado antes.
 *
 * Nunca lança por causa da cobrança: assinatura criada e cobrança falha é um
 * estado recuperável (o cliente tenta pagar de novo pelo `/portal`); assinatura
 * perdida porque o Mercado Pago piscou não é.
 */
export async function contratar(pedido: PedidoDeContratacao): Promise<ResultadoContratacao> {
  const produto = pedido.produto.trim().toUpperCase();
  if (!PRODUTOS.has(produto)) {
    throw new ContratacaoInvalida(`Produto desconhecido: ${pedido.produto}`);
  }

  const tenant = pedido.tenant.trim().toLowerCase();
  const email = pedido.email.trim().toLowerCase();
  const empresa = pedido.empresa.trim();
  if (!tenant || !email.includes("@") || empresa.length < 2) {
    throw new ContratacaoInvalida("Informe empresa, e-mail e o identificador do produto.");
  }

  let documento = "";
  if (pedido.cpfCnpj?.trim()) {
    const classificado = classifyCpfCnpj(pedido.cpfCnpj);
    if (!classificado?.valid) {
      throw new ContratacaoInvalida("CPF ou CNPJ inválido.");
    }
    documento = classificado.digits;
  }

  const plano = await prisma.servicePlan.findUnique({ where: { slug: pedido.plano.trim() } });
  if (!plano || plano.status !== "ACTIVE" || plano.priceCents === null) {
    throw new ContratacaoInvalida("Plano não encontrado ou sem preço definido.");
  }

  // 1. Já contratado? Devolve o mesmo, sem criar nada.
  const existente = await prisma.subscription.findUnique({
    where: { productKey_productTenantId: { productKey: produto, productTenantId: tenant } },
    select: { id: true, organizationId: true, amount: true },
  });
  if (existente) {
    const fatura = await faturaDoMes(existente.id);
    return {
      novo: false,
      organizationId: existente.organizationId,
      subscriptionId: existente.id,
      invoiceId: fatura?.id ?? "",
      contaCriada: false,
      senhaProvisoria: null,
      valorCents: Math.round(Number(existente.amount) * 100),
      cobranca: fatura ? await cobrar(fatura.id) : null,
    };
  }

  // 2. A empresa pode já existir: o mesmo dono contratando o segundo produto
  //    não vira duas fichas.
  const organizationId = await acharOuCriarOrganizacao({ empresa, documento, email });

  // 3. Conta de acesso ao SSO, com senha provisória para o primeiro login.
  const acesso = await garantirAcessoCliente({
    nome: pedido.responsavel.trim() || empresa,
    email,
    cpfCnpj: documento || null,
    telefone: pedido.telefone ?? null,
    emailRecuperacao: pedido.emailRecuperacao,
  });
  await vincularContaAOrganizacao(acesso.id, organizationId);

  // 4. Assinatura. O dia da cobrança acompanha o dia de hoje, limitado a 28:
  //    mensalidade que some em fevereiro é conversa desagradável.
  const hoje = new Date();
  const assinatura = await prisma.subscription.create({
    data: {
      organizationId,
      description: `${plano.name} (${rotuloProduto(produto)})`,
      amount: plano.priceCents / 100,
      billingDay: Math.min(hoje.getUTCDate(), 28),
      status: "ACTIVE",
      startedAt: hoje,
      productKey: produto,
      productTenantId: tenant,
    },
    select: { id: true },
  });

  const competencia = `${hoje.getUTCFullYear()}-${String(hoje.getUTCMonth() + 1).padStart(2, "0")}`;
  const fatura = await garantirFatura({ subscriptionId: assinatura.id, competencia });
  if (!fatura) {
    throw new ContratacaoInvalida("Não consegui abrir a primeira fatura.");
  }

  await prisma.operationsAuditEvent.create({
    data: {
      action: "SUBSCRIPTION_CREATED",
      entityType: "Subscription",
      entityId: assinatura.id,
      organizationId,
      metadata: { produto, tenant, plano: plano.slug, porOnde: "autoatendimento" },
    },
  });
  await marcarEtapa(organizationId, "BILLING", `${plano.name} contratado pelo autoatendimento`);

  return {
    novo: true,
    organizationId,
    subscriptionId: assinatura.id,
    invoiceId: fatura.id,
    contaCriada: acesso.criado,
    senhaProvisoria: acesso.senha,
    valorCents: plano.priceCents,
    cobranca: await cobrar(fatura.id),
  };
}

/** A fatura aberta mais recente da assinatura, se houver. */
async function faturaDoMes(subscriptionId: string) {
  return prisma.subscriptionInvoice.findFirst({
    where: { subscriptionId, status: { in: ["OPEN", "OVERDUE"] } },
    orderBy: { dueDate: "desc" },
    select: { id: true },
  });
}

/**
 * Cobrança nunca derruba a contratação.
 *
 * O cliente sem Pix na tela ainda tem a fatura no `/portal` e consegue gerar
 * de novo; o cliente sem assinatura porque o gateway piscou some.
 */
async function cobrar(invoiceId: string): Promise<ResultadoContratacao["cobranca"]> {
  try {
    const cobranca = await criarCobrancaDaFatura({ invoiceId, metodo: "PIX" });
    return {
      metodo: cobranca.method,
      pixCopiaECola: cobranca.pixCopyPaste,
      pixQrBase64: cobranca.pixQrBase64,
      expiraEm: cobranca.expiresAt?.toISOString() ?? null,
    };
  } catch (erro) {
    console.error(`[contratacao] fatura ${invoiceId} ficou sem cobrança`, erro);
    return null;
  }
}

/**
 * Uma empresa por documento, e sem documento uma por e-mail de contato.
 *
 * Sem esta busca, o mesmo dono contratando loja hoje e e-mail amanhã viraria
 * duas fichas, duas cobranças e duas conversas.
 */
async function acharOuCriarOrganizacao(dados: {
  empresa: string;
  documento: string;
  email: string;
}): Promise<string> {
  if (dados.documento) {
    const porDocumento = await prisma.organization.findFirst({
      where: { cpfCnpj: dados.documento },
      select: { id: true },
    });
    if (porDocumento) return porDocumento.id;
  }

  const porContato = await prisma.organization.findFirst({
    where: { contacts: { some: { email: { equals: dados.email, mode: "insensitive" } } } },
    select: { id: true },
  });
  if (porContato) return porContato.id;

  const criada = await prisma.organization.create({
    data: {
      name: dados.empresa,
      slug: await slugLivreDeOrganizacao(dados.empresa),
      status: "ONBOARDING",
      ...(dados.documento ? { cpfCnpj: dados.documento } : {}),
      contacts: {
        create: { name: dados.empresa, email: dados.email, isPrimary: true },
      },
    },
    select: { id: true },
  });
  return criada.id;
}

function rotuloProduto(produto: string): string {
  const mapa: Record<string, string> = {
    LOJA: "Lojas Ávila Ops",
    MAIL: "Avila Mail",
    COMANDEIRO: "Comandeiro",
    SITE: "Site, domínio e e-mail",
  };
  return mapa[produto] ?? produto;
}
