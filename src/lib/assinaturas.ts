import { prisma } from "@/lib/prisma";
import {
  createBoletoCharge,
  createCardCharge,
  createPixCharge,
  type EfiPayer,
} from "@/lib/efi-cobranca";
import { opcaoParcelamento, simularParcelamento } from "@/lib/parcelamento";

/**
 * Mensalidade dos clientes da Avila Ops.
 *
 * A cobrança mora aqui, e não dentro de cada produto: um produto que cobra a
 * si mesmo vira dois lugares para acertar preço, dois para suspender
 * inadimplente e dois para errar. O produto só pergunta "qual é a fatura do
 * meu cliente X?" e mostra a resposta.
 *
 * Quem pergunta se identifica pelo par (`productKey`, `productTenantId`) —
 * `minas` + o UUID do tenant lá dentro. O produto nunca conhece `Organization`,
 * e é isso que permite trocar o CNPJ do cliente aqui sem tocar no produto.
 */

export type MetodoCobranca = "PIX" | "BOLETO" | "CARD";

/** O que o produto recebe para desenhar a tela. Sem dado interno da Avila Ops. */
export type FaturaResumo = {
  id: string;
  competencia: string;
  /** MONTHLY | SETUP — a tela do produto escreve "Implantação" no segundo. */
  tipo: string;
  valorCents: number;
  vencimento: string;
  status: string;
  pagoEm: string | null;
  cobrancas: {
    metodo: string;
    status: string;
    valorCents: number;
    parcelas: number;
    jurosCents: number;
    pixCopiaECola: string | null;
    pixQrBase64: string | null;
    boletoUrl: string | null;
    boletoLinhaDigitavel: string | null;
    expiraEm: string | null;
  }[];
};

export type AssinaturaResumo = {
  descricao: string;
  valorCents: number;
  diaVencimento: number;
  status: string;
  /** Se falta dado para emitir boleto/cartão, diz o que falta — em português. */
  bloqueioPagamento: string | null;
  parcelamento: { parcelas: number; valorParcelaCents: number; totalCents: number }[];
  emAberto: FaturaResumo[];
  historico: FaturaResumo[];
};

function centavos(valor: { toString(): string }): number {
  return Math.round(Number(valor.toString()) * 100);
}

function resumoFatura(fatura: {
  id: string;
  competence: string;
  kind: string;
  amount: { toString(): string };
  dueDate: Date;
  status: string;
  paidAt: Date | null;
  charges: {
    method: string;
    status: string;
    amount: { toString(): string };
    installments: number;
    interestAmount: { toString(): string };
    pixCopyPaste: string | null;
    pixQrBase64: string | null;
    boletoUrl: string | null;
    boletoBarcode: string | null;
    expiresAt: Date | null;
  }[];
}): FaturaResumo {
  return {
    id: fatura.id,
    competencia: fatura.competence,
    tipo: fatura.kind,
    valorCents: centavos(fatura.amount),
    vencimento: fatura.dueDate.toISOString().slice(0, 10),
    status: fatura.status,
    pagoEm: fatura.paidAt?.toISOString() ?? null,
    cobrancas: fatura.charges.map((cobranca) => ({
      metodo: cobranca.method,
      status: cobranca.status,
      valorCents: centavos(cobranca.amount),
      parcelas: cobranca.installments,
      jurosCents: centavos(cobranca.interestAmount),
      pixCopiaECola: cobranca.pixCopyPaste,
      pixQrBase64: cobranca.pixQrBase64,
      boletoUrl: cobranca.boletoUrl,
      boletoLinhaDigitavel: cobranca.boletoBarcode,
      expiraEm: cobranca.expiresAt?.toISOString() ?? null,
    })),
  };
}

const INCLUI_COBRANCAS = {
  charges: { orderBy: { createdAt: "desc" } as const },
} as const;

export async function assinaturaDoProduto(params: {
  productKey: string;
  productTenantId: string;
}): Promise<AssinaturaResumo | null> {
  const assinatura = await prisma.subscription.findUnique({
    where: {
      productKey_productTenantId: {
        productKey: params.productKey,
        productTenantId: params.productTenantId,
      },
    },
    include: {
      organization: { include: { profile: true, contacts: { where: { isPrimary: true } } } },
      invoices: {
        orderBy: { competence: "desc" },
        include: INCLUI_COBRANCAS,
      },
    },
  });

  if (!assinatura) return null;

  const valorCents = centavos(assinatura.amount);
  const emAberto = assinatura.invoices.filter((f) => f.status === "OPEN" || f.status === "OVERDUE");
  const historico = assinatura.invoices.filter((f) => f.status === "PAID" || f.status === "CANCELLED");

  return {
    descricao: assinatura.description,
    valorCents,
    diaVencimento: assinatura.billingDay,
    status: assinatura.status,
    bloqueioPagamento: faltaParaCobrar(assinatura.organization),
    parcelamento: simularParcelamento(valorCents).map((opcao) => ({
      parcelas: opcao.parcelas,
      valorParcelaCents: opcao.valorParcelaCents,
      totalCents: opcao.totalCents,
    })),
    emAberto: emAberto.map(resumoFatura),
    historico: historico.slice(0, 12).map(resumoFatura),
  };
}

type OrganizacaoComDados = {
  name: string;
  legalName: string | null;
  cpfCnpj: string | null;
  profile: { ownerName: string | null; email: string | null; responsibleCpf: string | null } | null;
  contacts: { name: string; email: string | null }[];
};

/**
 * PIX não precisa de nada — nem nome. Boleto e cartão precisam de titular
 * pessoa física, e é aí que falta dado com frequência.
 *
 * A mensagem é a que vai aparecer para o cliente do cliente, então diz o que
 * fazer, não o nome do campo no banco.
 */
function faltaParaCobrar(organizacao: OrganizacaoComDados): string | null {
  const cpf = organizacao.profile?.responsibleCpf?.replace(/\D/g, "") ?? "";
  const email = organizacao.profile?.email ?? organizacao.contacts[0]?.email ?? "";

  if (cpf.length !== 11 || !email) {
    return "Boleto e cartão pedem o CPF e o e-mail de quem responde pela empresa. Fale com a Avila Ops para completar o cadastro — o PIX funciona sem isso.";
  }

  return null;
}

function pagador(organizacao: OrganizacaoComDados): EfiPayer {
  const documento = organizacao.cpfCnpj?.replace(/\D/g, "") ?? "";
  const cpf = organizacao.profile?.responsibleCpf?.replace(/\D/g, "") ?? "";

  return {
    name: organizacao.profile?.ownerName ?? organizacao.contacts[0]?.name ?? organizacao.name,
    cpf,
    email: organizacao.profile?.email ?? organizacao.contacts[0]?.email ?? "",
    // CNPJ tem 14 dígitos; abaixo disso é o CPF do próprio titular, e aí não
    // existe pessoa jurídica para declarar.
    company:
      documento.length === 14
        ? { cnpj: documento, corporateName: organizacao.legalName ?? organizacao.name }
        : undefined,
  };
}

export class CobrancaIndisponivelError extends Error {}

/**
 * Emite uma cobrança nova para uma fatura aberta.
 *
 * Uma fatura pode ter várias: o cliente gera o PIX, desiste, e no dia seguinte
 * tira um boleto. As duas existem e só uma será paga — por isso a baixa é por
 * fatura, não por cobrança (ver o webhook).
 */
export async function criarCobrancaDaFatura(params: {
  invoiceId: string;
  metodo: MetodoCobranca;
  parcelas?: number;
  paymentToken?: string;
}) {
  const fatura = await prisma.subscriptionInvoice.findUnique({
    where: { id: params.invoiceId },
    include: {
      subscription: {
        include: {
          organization: {
            include: { profile: true, contacts: { where: { isPrimary: true } } },
          },
        },
      },
    },
  });

  if (!fatura) throw new CobrancaIndisponivelError("Fatura não encontrada.");
  if (fatura.status === "PAID") throw new CobrancaIndisponivelError("Esta fatura já está paga.");
  if (fatura.status === "CANCELLED") throw new CobrancaIndisponivelError("Esta fatura foi cancelada.");

  const organizacao = fatura.subscription.organization;
  const valorCents = centavos(fatura.amount);
  const descricao = `${fatura.subscription.description} · ${fatura.competence}`;

  if (params.metodo === "PIX") {
    const cobranca = await createPixCharge({
      amount: valorCents / 100,
      description: descricao,
      // 24 horas: PIX de mensalidade não é compra de impulso, e uma hora
      // obrigaria a gerar de novo quem abriu a tela e foi almoçar.
      expiresInSeconds: 86_400,
    });

    return prisma.subscriptionCharge.create({
      data: {
        invoiceId: fatura.id,
        method: "PIX",
        externalId: cobranca.externalId,
        status: "PENDING",
        amount: fatura.amount,
        pixCopyPaste: cobranca.copyPaste,
        pixQrBase64: cobranca.qrCodeBase64,
        expiresAt: cobranca.expiresAt,
      },
    });
  }

  const bloqueio = faltaParaCobrar(organizacao);
  if (bloqueio) throw new CobrancaIndisponivelError(bloqueio);

  if (params.metodo === "BOLETO") {
    const cobranca = await createBoletoCharge({
      amountCents: valorCents,
      description: descricao,
      expireInDays: 3,
      payer: pagador(organizacao),
    });

    return prisma.subscriptionCharge.create({
      data: {
        invoiceId: fatura.id,
        method: "BOLETO",
        externalId: cobranca.externalId,
        status: "PENDING",
        amount: fatura.amount,
        boletoUrl: cobranca.boletoUrl,
        boletoBarcode: cobranca.barcode,
        expiresAt: cobranca.expiresAt,
      },
    });
  }

  // Cartão: o juros do parcelamento é do pagador (ver lib/parcelamento).
  const parcelas = params.parcelas ?? 1;
  const opcao = opcaoParcelamento(valorCents, parcelas);

  if (!opcao) throw new CobrancaIndisponivelError("Número de parcelas inválido.");
  if (!params.paymentToken) throw new CobrancaIndisponivelError("Falta o token do cartão.");

  const cobranca = await createCardCharge({
    // O valor cobrado é o COM juros. Mandar o da fatura e parcelar em 12 faria
    // a Avila Ops pagar o parcelamento que o cliente escolheu.
    amountCents: opcao.totalCents,
    description: descricao,
    installments: parcelas,
    paymentToken: params.paymentToken,
    payer: pagador(organizacao),
  });

  return prisma.subscriptionCharge.create({
    data: {
      invoiceId: fatura.id,
      method: "CARD",
      externalId: cobranca.externalId,
      status: cobranca.status,
      amount: opcao.totalCents / 100,
      installments: parcelas,
      interestAmount: opcao.jurosCents / 100,
    },
  });
}

/**
 * Cria a fatura da competência se ela ainda não existir.
 *
 * Idempotente pelo índice único (assinatura, competência): rodar duas vezes no
 * mesmo mês devolve a mesma fatura em vez de cobrar duas.
 */
export async function garantirFatura(params: {
  subscriptionId: string;
  competencia: string;
  /** MONTHLY (padrão) ou SETUP, a implantação — que tem valor próprio. */
  tipo?: "MONTHLY" | "SETUP";
  valorCents?: number;
  vencimento?: Date;
}) {
  const assinatura = await prisma.subscription.findUnique({
    where: { id: params.subscriptionId },
  });

  if (!assinatura || assinatura.status !== "ACTIVE") return null;

  const tipo = params.tipo ?? "MONTHLY";
  const [ano, mes] = params.competencia.split("-").map(Number);
  const vencimento =
    params.vencimento ?? new Date(Date.UTC(ano, mes - 1, assinatura.billingDay));

  return prisma.subscriptionInvoice.upsert({
    where: {
      subscriptionId_competence_kind: {
        subscriptionId: assinatura.id,
        competence: params.competencia,
        kind: tipo,
      },
    },
    update: {},
    create: {
      subscriptionId: assinatura.id,
      competence: params.competencia,
      kind: tipo,
      amount:
        params.valorCents === undefined ? assinatura.amount : params.valorCents / 100,
      dueDate: vencimento,
      status: "OPEN",
    },
    include: INCLUI_COBRANCAS,
  });
}

/**
 * Baixa a fatura quando a Efí confirma o pagamento.
 *
 * Marca a COBRANÇA e a FATURA. As outras tentativas da mesma fatura continuam
 * como estão — um boleto não pago de uma fatura quitada por PIX não vira
 * problema, porque quem manda no acesso é o status da fatura.
 */
export async function baixarCobrancaPorIdExterno(externalId: string, status: string) {
  const cobranca = await prisma.subscriptionCharge.findFirst({
    where: { externalId },
    include: { invoice: true },
  });

  if (!cobranca) return null;

  const pago = ["PAID", "paid", "CONFIRMED", "settled"].includes(status);
  const agora = new Date();

  await prisma.subscriptionCharge.update({
    where: { id: cobranca.id },
    data: { status, paidAt: pago ? agora : cobranca.paidAt },
  });

  if (pago && cobranca.invoice.status !== "PAID") {
    await prisma.subscriptionInvoice.update({
      where: { id: cobranca.invoiceId },
      data: { status: "PAID", paidAt: agora },
    });
  }

  return cobranca;
}
