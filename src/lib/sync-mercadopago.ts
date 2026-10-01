import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import {
  listarPagamentosDoPeriodo,
  mercadoPagoConfigurado,
  usuarioDoToken,
  type PagamentoRecebido,
} from "@/lib/mercadopago";
import { prisma } from "@/lib/prisma";

/**
 * O que a Avila Ops recebe pelo Mercado Pago, dentro do extrato.
 *
 * Sem isto o dinheiro do Mercado Pago não existia no financeiro: o extrato
 * tinha só Efí e Wise, e a tela `/financeiro/mercadopago` é um painel de
 * assinaturas, não uma conta do fluxo de caixa. Quem olhasse "Entradas · 30
 * dias" via um número que não incluía a mensalidade das lojas.
 *
 * Mesma forma do `runEfiSync`: uma conta em `bank_accounts`, uma corrida em
 * `bank_sync_runs` e uma linha por pagamento em `bank_transactions`, cada uma
 * com sua conciliação pendente.
 */

const MP_ACCOUNT_ID = "mercadopago-production";

/**
 * Só o que virou dinheiro. `pending` e `in_process` ainda podem ser recusados,
 * e lançar promessa no extrato infla o saldo — o mesmo erro de contar boleto
 * emitido como recebido.
 */
const STATUS_QUE_VIRAM_LINHA = new Set(["approved", "refunded", "charged_back"]);

/**
 * O que cada pagamento vira no extrato, ou `null` quando não vira nada.
 *
 * `/v1/payments/search` devolve os dois lados: o que a conta **recebeu**
 * (somos o collector) e o que a conta **pagou** (somos o payer, numa compra
 * no Mercado Livre, por exemplo). Descoberto em 11/09/2026 com o único
 * pagamento da conta, um fone de R$ 24,90 que entraria como "Venda".
 *
 * Exportado para o teste: é a regra que decide se um valor entra no fluxo de
 * caixa e em que sentido, e errar aqui infla ou some com dinheiro.
 */
export function lancamentoDoPagamento(
  status: string,
  lado: "RECEBEMOS" | "PAGAMOS" = "RECEBEMOS",
): {
  direction: "CREDIT" | "DEBIT";
  category: string;
  scope: "EMPRESA" | "INDEFINIDO";
} | null {
  if (!STATUS_QUE_VIRAM_LINHA.has(status)) return null;
  const devolucao = status === "refunded" || status === "charged_back";
  if (lado === "PAGAMOS") {
    // Compra pela conta do Mercado Pago: pode ser insumo da casa ou fone de
    // ouvido pessoal. Vai para a fila de triagem, como o cartão da Wise.
    return {
      direction: devolucao ? "CREDIT" : "DEBIT",
      category: devolucao ? "Estorno de compra" : "Compra",
      scope: "INDEFINIDO",
    };
  }
  return {
    direction: devolucao ? "DEBIT" : "CREDIT",
    category: devolucao ? "Estorno de venda" : "Venda",
    scope: "EMPRESA",
  };
}

/** De que lado do pagamento a conta do token está. */
export function ladoDoPagamento(
  p: { collectorId: number | null; payerId: number | null },
  nossoId: number,
): "RECEBEMOS" | "PAGAMOS" {
  if (p.collectorId === nossoId) return "RECEBEMOS";
  if (p.payerId === nossoId) return "PAGAMOS";
  // Sem os dois ids, o padrão é o que a rota sempre foi: recebimento.
  return "RECEBEMOS";
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Falha desconhecida";
  return message.replace(/\s+/g, " ").slice(0, 240);
}

export type ContaMercadoPago = {
  /** Id em `bank_accounts`, ex.: "mercadopago-production", "mercadopago-cnpj". */
  id: string;
  /** Id do usuário no Mercado Pago (`/users/me`), para saber de que lado estamos. */
  usuarioId: number;
  displayName: string;
  externalId: string;
};

/**
 * Sincroniza a conta cujo token está no ambiente do app (`MP_ACCESS_TOKEN`).
 * É a conta que as lojas usam para cobrar. Outras contas chegam pelo n8n, em
 * `gravarPagamentosMercadoPago`.
 */
export async function runMercadoPagoSync(options?: {
  actorId?: string | null;
  days?: number;
}) {
  if (!(await mercadoPagoConfigurado())) {
    throw new Error("Mercado Pago não configurado (MP_ACCESS_TOKEN ausente).");
  }

  const days = Math.max(
    1,
    Math.min(365, options?.days ?? Number.parseInt(process.env.MP_SYNC_DAYS ?? "90", 10) ?? 90),
  );
  const desde = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [pagamentos, nos] = await Promise.all([listarPagamentosDoPeriodo(desde), usuarioDoToken()]);

  return gravarPagamentosMercadoPago({
    conta: { id: MP_ACCOUNT_ID, usuarioId: nos.id, displayName: "Mercado Pago", externalId: "primary" },
    pagamentos,
    days,
    actorId: options?.actorId,
  });
}

/**
 * Grava no extrato os pagamentos de uma conta do Mercado Pago, venham de onde
 * vierem: do token do app ou de um fluxo do n8n que leu outra conta. Uma conta
 * em `bank_accounts`, uma corrida em `bank_sync_runs`, uma linha por
 * pagamento com conciliação pendente.
 */
export async function gravarPagamentosMercadoPago(input: {
  conta: ContaMercadoPago;
  pagamentos: PagamentoRecebido[];
  days: number;
  actorId?: string | null;
}) {
  const { conta, pagamentos, days } = input;
  const options = { actorId: input.actorId };
  const nos = { id: conta.usuarioId };
  const MP_ACCOUNT_ID = conta.id;

  await prisma.bankAccount.upsert({
    where: { id: MP_ACCOUNT_ID },
    update: { active: true, displayName: conta.displayName },
    create: {
      id: MP_ACCOUNT_ID,
      provider: "mercadopago",
      externalId: conta.externalId,
      displayName: conta.displayName,
      environment: "production",
      currency: "BRL",
    },
  });

  const run = await prisma.bankSyncRun.create({
    data: { accountId: MP_ACCOUNT_ID, status: "RUNNING", scopeDays: days },
  });

  try {
    const capturadoEm = new Date();
    let receivedCount = 0;
    let sentCount = 0;

    await prisma.$transaction(async (transaction) => {
      for (const p of pagamentos) {
        // Estorno e chargeback devolvem dinheiro: entram como saída, senão a
        // venda cancelada continuaria somando no fluxo.
        const lado = ladoDoPagamento(p, nos.id);
        const lancamento = lancamentoDoPagamento(p.status, lado);
        if (!lancamento) continue;
        const ocorridoEm = new Date(p.data);
        if (Number.isNaN(ocorridoEm.getTime())) continue;

        const { direction } = lancamento;
        if (direction === "CREDIT") receivedCount += 1;
        else sentCount += 1;

        // Valor BRUTO, como no Efí: a taxa do Mercado Pago é despesa e aparece
        // no extrato dele como linha própria. Lançar o líquido aqui esconderia
        // quanto a casa paga de taxa.
        const reais = new Prisma.Decimal(p.valorCentavos).dividedBy(100);
        const externalId = String(p.id);
        const descricao = p.descricao?.trim() || `Pagamento Mercado Pago ${p.id}`;

        const bankTransaction = await transaction.bankTransaction.upsert({
          where: { accountId_externalId: { accountId: MP_ACCOUNT_ID, externalId } },
          update: {
            amount: reais,
            description: descricao,
            counterpartyName: p.email,
            occurredAt: ocorridoEm,
            // O lado pode ter sido lido errado antes de 11/09/2026 (compra
            // gravada como venda): a reimportação corrige direção e categoria.
            direction,
            category: lancamento.category,
          },
          create: {
            accountId: MP_ACCOUNT_ID,
            externalId,
            direction,
            transactionType: p.meio ?? "mercadopago",
            amount: reais,
            currency: "BRL",
            description: descricao,
            counterpartyName: p.email,
            occurredAt: ocorridoEm,
            rawHash: createHash("sha256")
              .update(`${p.id}|${p.status}|${p.valorCentavos}|${p.data}`)
              .digest("hex"),
            // Recebimento pelo Mercado Pago é venda da casa; compra pela conta
            // vai para a triagem, porque pode ser pessoal.
            scope: lancamento.scope,
            scopeSource: "IMPORTACAO",
            category: lancamento.category,
          },
        });

        await transaction.reconciliation.upsert({
          where: { transactionId: bankTransaction.id },
          update: {},
          create: {
            transactionId: bankTransaction.id,
            status: "PENDING",
            matchSource: "MERCADOPAGO_IMPORT",
          },
        });
      }

      await transaction.bankAccount.update({
        where: { id: MP_ACCOUNT_ID },
        data: { lastSyncAt: capturadoEm },
      });

      await transaction.bankSyncRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCESS",
          receivedCount,
          sentCount,
          // O Mercado Pago não devolve saldo disponível nesta rota; o saldo da
          // conta é o do painel deles.
          balanceCaptured: false,
          finishedAt: new Date(),
        },
      });

      await transaction.financeAuditEvent.create({
        data: {
          actorId: options?.actorId ?? null,
          action: "MERCADOPAGO_SYNC_COMPLETED",
          entityType: "BankSyncRun",
          entityId: run.id.toString(),
          metadata: {
            scopeDays: days,
            receivedCount,
            sentCount,
            analisados: pagamentos.length,
          },
        },
      });
    });

    return { runId: run.id.toString(), status: "SUCCESS" as const, receivedCount, sentCount };
  } catch (error) {
    const errorMessage = safeErrorMessage(error);

    await prisma.$transaction([
      prisma.bankSyncRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          errorCode: "MERCADOPAGO_SYNC_FAILED",
          errorMessage,
          finishedAt: new Date(),
        },
      }),
      prisma.financeAuditEvent.create({
        data: {
          actorId: options?.actorId ?? null,
          action: "MERCADOPAGO_SYNC_FAILED",
          entityType: "BankSyncRun",
          entityId: run.id.toString(),
          metadata: { scopeDays: days, error: errorMessage },
        },
      }),
    ]);

    throw new Error(errorMessage);
  }
}
