import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createBoletoCharge,
  createCardCharge,
  createPixCharge,
  type Pagador,
} from "@/lib/mercadopago-cobranca";
import { criarOrdem, MoedaNaoSuportadaPeloPaypal, valorPaypal } from "@/lib/paypal";
import { opcaoParcelamento, simularParcelamento } from "@/lib/parcelamento";

/**
 * Mensalidade dos clientes da Avila Ops.
 *
 * **Gateway: Mercado Pago** (decisão de 30/08/2026, "esquece do banco Efí por
 * enquanto"). Cobrança nova nasce lá; as que já estavam abertas na Efí seguem
 * sendo baixadas pelo webhook dela, e por isso os dois convivem no
 * `baixarCobrancaPorIdExterno` até a última fechar.
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

export type MetodoCobranca = "PIX" | "BOLETO" | "CARD" | "PAYPAL";

export function paisEhBrasil(pais: string | null | undefined): boolean {
  const normalizado = (pais ?? "Brasil").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  return ["BR", "BRA", "BRASIL", "BRAZIL"].includes(normalizado);
}

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
    /*
      O bloqueio mostrado ao cliente é o do BOLETO, o mais exigente dos três.
      Se ele passa, cartão e PIX passam - então uma frase só cobre a tela
      inteira, que é o que o produto desenha.
    */
    bloqueioPagamento: faltaParaCobrar(assinatura.organization, "BOLETO"),
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
  profile: {
    ownerName: string | null;
    email: string | null;
    responsibleCpf: string | null;
    // Endereço: exigência nova do boleto do Mercado Pago (30/08/2026).
    postalCode: string | null;
    street: string | null;
    number: string | null;
    district: string | null;
    city: string | null;
    state: string | null;
  } | null;
  contacts: { name: string; email: string | null }[];
};

/**
 * PIX não precisa de nada além do e-mail. Boleto e cartão precisam de
 * documento, e o boleto precisa também de endereço — é aí que falta dado com
 * frequência.
 *
 * A mensagem é a que vai aparecer para o cliente do cliente, então diz o que
 * fazer, não o nome do campo no banco.
 */
/**
 * O que impede boleto e cartão.
 *
 * O PIX passa só com e-mail; boleto e cartão pedem documento. O boleto do
 * Mercado Pago pede ENDEREÇO por cima disso — a Efí não pedia, e é a única
 * exigência que a migração de 30/08/2026 acrescentou. Sem o endereço a API
 * devolve 400 sem dizer qual campo faltou, então a checagem é aqui, com a
 * frase que o cliente entende.
 */
function faltaParaCobrar(
  organizacao: OrganizacaoComDados,
  metodo: MetodoCobranca,
): string | null {
  const documento = organizacao.cpfCnpj?.replace(/\D/g, "") ?? "";
  const cpf = organizacao.profile?.responsibleCpf?.replace(/\D/g, "") ?? "";
  const email = organizacao.profile?.email ?? organizacao.contacts[0]?.email ?? "";

  // CNPJ da empresa OU CPF do responsável: no Mercado Pago o par
  // (tipo, número) é um só, e qualquer um dos dois serve.
  if ((documento.length !== 14 && cpf.length !== 11) || !email) {
    return "Boleto e cartão pedem o CNPJ (ou o CPF de quem responde) e o e-mail da empresa. Fale com a Avila Ops para completar o cadastro - o PIX funciona sem isso.";
  }

  if (metodo === "BOLETO" && !enderecoDoPagador(organizacao)) {
    return "O boleto pede o endereço completo da empresa: CEP, rua, número, bairro, cidade e UF. Fale com a Avila Ops para completar o cadastro - o PIX e o cartão funcionam sem isso.";
  }

  return null;
}

function enderecoDoPagador(organizacao: OrganizacaoComDados) {
  const p = organizacao.profile;
  const cep = p?.postalCode?.replace(/\D/g, "") ?? "";

  if (!p || cep.length !== 8 || !p.street || !p.number || !p.district || !p.city || !p.state) {
    return undefined;
  }

  return {
    cep,
    rua: p.street,
    numero: p.number,
    bairro: p.district,
    cidade: p.city,
    uf: p.state.toUpperCase().slice(0, 2),
  };
}

function pagador(organizacao: OrganizacaoComDados): Pagador {
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
    endereco: enderecoDoPagador(organizacao),
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
  /** Vem do formulário de cartão do Mercado Pago, junto do token. */
  paymentMethodId?: string;
  issuerId?: string;
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

  // Mercado Pago (Brasil) só emite BRL; o PayPal cobra na moeda da assinatura
  // (o trilho internacional). Outra moeda por outro método vira pagamento manual.
  if (fatura.subscription.currency !== "BRL" && params.metodo !== "PAYPAL") {
    throw new CobrancaIndisponivelError("Cobrança automática nesta moeda só está disponível pelo PayPal (fora do Brasil). Solicite o pagamento ao atendimento.");
  }
  const [saldo] = await prisma.$queryRaw<{ outstanding: unknown; amount: unknown }[]>`
    SELECT outstanding,amount FROM core.receivables WHERE source='INVOICE' AND source_id=${fatura.id}`;
  if (!saldo || Number(saldo.outstanding) !== Number(saldo.amount)) {
    throw new CobrancaIndisponivelError("Há pagamento registrado para esta fatura. Concilie o saldo antes de gerar outra cobrança.");
  }

  const organizacao = fatura.subscription.organization;
  const valorCents = centavos(fatura.amount);
  const descricao = `${fatura.subscription.description} · ${fatura.competence}`;
  const pais = organizacao.profile?.country ?? "Brasil";
  const brasileira = paisEhBrasil(pais);

  if (brasileira && params.metodo === "PAYPAL") {
    throw new CobrancaIndisponivelError("No Brasil, o pagamento é processado pelo Mercado Pago.");
  }
  if (!brasileira && params.metodo !== "PAYPAL") {
    throw new CobrancaIndisponivelError("Fora do Brasil, o pagamento é processado pelo PayPal.");
  }

  /*
    Chave de idempotência do gateway: fatura + método + minuto.

    O minuto entra de propósito. Amarrar só à fatura impediria o cliente de
    gerar um PIX novo depois de o primeiro vencer - o Mercado Pago devolveria
    a cobrança antiga, já expirada. Amarrar a nada devolveria cobrança dupla
    quando a rede cai depois do POST e o app tenta de novo. O minuto é a
    janela em que "de novo" é retry, e não segunda tentativa do cliente.
  */
  const chaveIdempotencia = `${fatura.id}:${params.metodo}:${Math.floor(Date.now() / 60_000)}`;

  if (params.metodo === "PAYPAL") {
    // Moeda que o PayPal não aceita (ou valor com centavos em moeda sem
    // centavos) vira mensagem de "indisponível", não erro genérico da API.
    try {
      valorPaypal(valorCents / 100, fatura.subscription.currency);
    } catch (erro) {
      if (erro instanceof MoedaNaoSuportadaPeloPaypal) throw new CobrancaIndisponivelError(erro.message);
      throw erro;
    }
    const origem = (process.env.APP_URL ?? "https://app.avilaops.com").replace(/\/$/, "");
    const ordem = await criarOrdem({
      valor: valorCents / 100,
      moeda: fatura.subscription.currency,
      descricao,
      referencia: fatura.id,
      retorno: `${origem}/api/paypal/retorno`,
      cancelamento: `${origem}/portal?pagamento=cancelado`,
    });
    return prisma.subscriptionCharge.create({
      data: {
        invoiceId: fatura.id,
        method: "PAYPAL",
        provider: "PAYPAL",
        externalId: ordem.id,
        status: ordem.status,
        amount: fatura.amount,
        checkoutUrl: ordem.aprovacao,
      },
    });
  }

  if (params.metodo === "PIX") {
    const cobranca = await createPixCharge({
      amount: valorCents / 100,
      description: descricao,
      // 24 horas: PIX de mensalidade não é compra de impulso, e uma hora
      // obrigaria a gerar de novo quem abriu a tela e foi almoçar.
      expiresInSeconds: 86_400,
      payer: pagador(organizacao),
      idempotencyKey: chaveIdempotencia,
    });

    return prisma.subscriptionCharge.create({
      data: {
        invoiceId: fatura.id,
        method: "PIX",
        provider: "MERCADO_PAGO",
        externalId: cobranca.externalId,
        status: "PENDING",
        amount: fatura.amount,
        pixCopyPaste: cobranca.copyPaste,
        pixQrBase64: cobranca.qrCodeBase64,
        expiresAt: cobranca.expiresAt,
      },
    });
  }

  const bloqueio = faltaParaCobrar(organizacao, params.metodo);
  if (bloqueio) throw new CobrancaIndisponivelError(bloqueio);

  if (params.metodo === "BOLETO") {
    const cobranca = await createBoletoCharge({
      amountCents: valorCents,
      description: descricao,
      expireInDays: 3,
      payer: pagador(organizacao),
      idempotencyKey: chaveIdempotencia,
    });

    return prisma.subscriptionCharge.create({
      data: {
        invoiceId: fatura.id,
        method: "BOLETO",
        provider: "MERCADO_PAGO",
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
    paymentMethodId: params.paymentMethodId,
    issuerId: params.issuerId,
    idempotencyKey: chaveIdempotencia,
  });

  return prisma.subscriptionCharge.create({
    data: {
      invoiceId: fatura.id,
      method: "CARD",
      provider: "MERCADO_PAGO",
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
/** O tipo da fatura recorrente de cada ciclo. */
export function recorrenteDe(ciclo: string): "MONTHLY" | "YEARLY" {
  return ciclo === "YEARLY" ? "YEARLY" : "MONTHLY";
}

/**
 * Competência da próxima cobrança, no formato AAAA-MM.
 *
 * No anual o passo é de doze meses: a assinatura que começou em 2026-09 volta
 * a cobrar em 2027-09, e não todo mês. O formato continua AAAA-MM de propósito
 * — a chave única (assinatura, competência, tipo) já garante uma por ano, e
 * mudar o formato quebraria as faturas que existem.
 */
export function competenciaSeguinte(competencia: string, ciclo: string): string {
  const [ano, mes] = competencia.split("-").map(Number);
  const passo = ciclo === "YEARLY" ? 12 : 1;
  const total = (ano * 12 + (mes - 1)) + passo;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export async function garantirFatura(params: {
  subscriptionId: string;
  competencia: string;
  /**
   * SETUP é a implantação, que tem valor próprio. Omitido, a recorrente segue
   * o ciclo da assinatura: MONTHLY ou YEARLY. Não assumir mensal aqui evita
   * que uma assinatura anual ganhe doze faturas por ano.
   */
  tipo?: "MONTHLY" | "YEARLY" | "SETUP";
  valorCents?: number;
  vencimento?: Date;
}) {
  const assinatura = await prisma.subscription.findUnique({
    where: { id: params.subscriptionId },
  });

  if (!assinatura || assinatura.status !== "ACTIVE") return null;

  const tipo = params.tipo ?? recorrenteDe(assinatura.billingCycle);
  const [ano, mes] = params.competencia.split("-").map(Number);
  const vencimento =
    params.vencimento ?? new Date(Date.UTC(ano, mes - 1, assinatura.billingDay));

  const chave = {
    subscriptionId_competence_kind: {
      subscriptionId: assinatura.id,
      competence: params.competencia,
      kind: tipo,
    },
  };

  try {
    return await prisma.subscriptionInvoice.upsert({
      where: chave,
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
  } catch (erro) {
    /*
      P2002 é a chave única `subscriptionId_competence_kind` barrando a
      segunda gravação.

      Este upsert não vira `INSERT ... ON CONFLICT` no Postgres: o `include`
      obriga o Prisma a ler antes de gravar, e entre a leitura e a gravação
      cabe outro processo. Quem perde a corrida recebe P2002 — e o cenário
      é comum, porque é o do comentário do teste: o cron rodando duas vezes,
      reinício do servidor no meio, ou execução à mão sem saber que o
      agendamento já rodou.

      A restrição fez exatamente o que devia: existe UMA fatura. Então este
      erro não é falha nenhuma — é a confirmação de que o trabalho já está
      feito. Basta devolver a fatura que o outro processo criou.
    */
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      return prisma.subscriptionInvoice.findUnique({
        where: chave,
        include: INCLUI_COBRANCAS,
      });
    }
    throw erro;
  }
}

/** Nomes de "devolveu o dinheiro": PayPal (REFUNDED) e Mercado Pago (refunded, charged_back). */
const REEMBOLSADO = ["REFUNDED", "refunded", "charged_back"];

/**
 * Baixa a fatura quando o gateway confirma o pagamento.
 *
 * Marca a COBRANÇA e a FATURA. As outras tentativas da mesma fatura continuam
 * como estão — um boleto não pago de uma fatura quitada por PIX não vira
 * problema, porque quem manda no acesso é o status da fatura.
 *
 * `pagoEm` é o instante em que o PROVEDOR aprovou/capturou. Sem ele, um
 * webhook atrasado ou reenviado depois de uma queda gravaria a hora do
 * processamento, e o dinheiro cairia no dia errado do ledger.
 */
export async function baixarCobrancaPorIdExterno(externalId: string, status: string, pagoEm?: Date | null) {
  const cobranca = await prisma.subscriptionCharge.findFirst({
    where: { externalId },
    include: { invoice: { include: { subscription: true } } },
  });

  if (!cobranca) return null;

  /*
    Os nomes de "pagou" de dois gateways ao mesmo tempo.

    "approved" é do Mercado Pago, que passou a ser o caminho padrão em
    30/08/2026; o resto é do Efí, e continua valendo porque as cobranças
    abertas nele ainda vão ser pagas. A lista só encolhe quando a última
    cobrança do Efí fechar.
  */
  const pago = ["PAID", "paid", "CONFIRMED", "COMPLETED", "settled", "approved"].includes(status);
  // O status vem sempre da API do provedor (o webhook reconsulta), então um
  // reembolso não é desfeito por evento fora de ordem: a API não volta a dizer
  // "aprovado" depois de devolver o dinheiro.
  const reembolsado = REEMBOLSADO.includes(status);
  /*
    "Já estava paga" se olha pelo `paidAt`, não pelo nome do status.

    Olhar o nome não funcionava para o Mercado Pago, e o teste do webhook novo
    (01/10/2026) é que mostrou: o webhook do Efí chama esta função com "PAID" já
    traduzido, e o do Mercado Pago chamava com o "approved" cru. A cobrança paga
    por lá ficava gravada como "approved", então esta guarda — que compara com
    "PAID" — nunca a protegeu: um "pending" atrasado, entregue depois do
    "approved", REABRIA a cobrança com o dinheiro já na conta. Era exatamente o
    que o comentário abaixo diz que não pode acontecer.

    `paidAt` não tem esse problema porque é gravado por igual para os dois.
  */
  const jaEstavaPago = cobranca.paidAt !== null || cobranca.status === "PAID";
  const momentoDoPagamento = pagoEm ?? new Date();

  await prisma.subscriptionCharge.update({
    where: { id: cobranca.id },
    data: {
      // Cobrança paga não volta atrás. Os dois gateways reenviam notificação
      // e a ordem de chegada não é garantida: um "pendente" atrasado,
      // processado depois do "pago", deixaria a cobrança aberta com o
      // dinheiro na conta.
      //
      // E "paga" se grava com UM nome só, "PAID", venha de qual gateway vier.
      // Antes, a mesma coluna guardava "PAID" para o Efí e "approved" para o
      // Mercado Pago — e quem consulta por status (a varredura de pendentes do
      // Efí usa `notIn: ["PAID", "CANCELLED"]`) tratava cobrança paga no
      // Mercado Pago como se ainda estivesse aberta.
      //
      // A exceção é o reembolso: o dinheiro voltou ao cliente, e "PAID" aqui
      // seria mentira. `paidAt` fica — é o histórico de quando entrou.
      status: reembolsado ? "REFUNDED" : jaEstavaPago || pago ? "PAID" : status,
      // `paidAt` é o instante do pagamento, não o do reprocessamento. Sem esta
      // guarda, reenviar o mesmo evento amanhã moveria a data de hoje para
      // amanhã, e a conciliação bancária deixaria de bater.
      paidAt: cobranca.paidAt ?? (pago ? momentoDoPagamento : null),
    },
  });

  if (pago && cobranca.invoice.status !== "PAID") {
    await prisma.subscriptionInvoice.update({
      where: { id: cobranca.invoiceId },
      data: { status: "PAID", paidAt: cobranca.invoice.paidAt ?? momentoDoPagamento },
    });
  }

  if (reembolsado && cobranca.invoice.status === "PAID") {
    // Política de reembolso: a fatura volta a dever. Sem isto a view
    // core.receivables força `outstanding` zero para fatura PAID e o portal
    // segue tratando como quitada, com o dinheiro já devolvido. Só reabre se
    // nenhuma OUTRA cobrança da mesma fatura continua paga — quitada por PIX e
    // com um cartão estornado, a fatura segue paga.
    const outraPaga = await prisma.subscriptionCharge.count({
      where: { invoiceId: cobranca.invoiceId, id: { not: cobranca.id }, status: "PAID" },
    });
    if (outraPaga === 0) {
      await prisma.subscriptionInvoice.update({
        where: { id: cobranca.invoiceId },
        data: { status: "OPEN", paidAt: null },
      });
    }
  }

  // Ledger único: todo pagamento confirmado deixa um registro em core.payments
  // (+ alocação na fatura), pra o painel de tesouraria ver o dinheiro de verdade
  // — hoje a baixa da cobrança não alimentava esse ledger, então gateway e
  // conciliação viviam separados. Idempotente (upsert pela chave do gateway) e
  // best-effort: a baixa é pro cliente; o ledger é pra nós e não pode derrubar
  // um pagamento que já deu certo.
  if (pago || reembolsado) {
    try {
      const assinatura = cobranca.invoice.subscription;
      const refExterna = cobranca.externalId ?? cobranca.id;

      if (reembolsado) {
        // A view core.receivables só conta alocações de pagamentos CONFIRMED,
        // então marcar como REFUNDED já tira este dinheiro dos recebíveis.
        await prisma.corePayment.updateMany({
          where: { provider: cobranca.provider, providerAccount: "principal", externalId: refExterna },
          data: { status: "REFUNDED" },
        });
      } else {
        const pagamento = await prisma.corePayment.upsert({
          where: {
            provider_providerAccount_externalId: {
              provider: cobranca.provider,
              providerAccount: "principal",
              externalId: refExterna,
            },
          },
          update: {},
          create: {
            organizationId: assinatura.organizationId,
            provider: cobranca.provider,
            providerAccount: "principal",
            externalId: refExterna,
            amount: cobranca.amount,
            currency: assinatura.currency,
            status: "CONFIRMED",
            paidAt: cobranca.paidAt ?? momentoDoPagamento,
            source: "GATEWAY_WEBHOOK",
          },
        });
        // Aloca só o principal da fatura: numa cobrança de cartão parcelado o
        // valor capturado inclui juros do pagador e passa do valor da fatura, e
        // o trigger core.guard_allocation rejeita alocação acima desse valor.
        if (pagamento.status === "CONFIRMED") {
          await prisma.corePaymentAllocation.upsert({
            where: { paymentId_invoiceId: { paymentId: pagamento.id, invoiceId: cobranca.invoiceId } },
            update: {},
            create: { paymentId: pagamento.id, invoiceId: cobranca.invoiceId, amount: cobranca.invoice.amount },
          });
        }
      }
    } catch (erro) {
      console.error(`[ledger] não registrei o pagamento de ${cobranca.id} em core.payments`, erro);
    }
  }

  return cobranca;
}
