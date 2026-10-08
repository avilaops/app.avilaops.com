import { garantirFatura, recorrenteDe } from "@/lib/assinaturas";
import { prisma } from "@/lib/prisma";

/**
 * A rotina que faltava: a fatura do mês nasce sozinha e a vencida vira vencida.
 *
 * Até 08/10/2026 `garantirFatura` só era chamada pela contratação e por um
 * clique na ficha do cliente. A mensalidade do segundo mês de quem contratou
 * pelo autoatendimento só existia se alguém abrisse a ficha — e nada passava
 * uma fatura de `OPEN` para `OVERDUE`, então "em atraso" era um estado que o
 * schema tinha e nenhum código produzia.
 *
 * O que esta rotina faz, e só isto:
 * 1. para cada assinatura ativa, garante a fatura recorrente da competência;
 * 2. passa para `OVERDUE` a fatura aberta cujo vencimento já passou.
 *
 * O que ela NÃO faz, de propósito: emitir PIX ou boleto e avisar o cliente.
 * Emitir cobrança fala com o gateway e mandar aviso fala com o cliente; os dois
 * continuam sendo atos de alguém (ficha do cliente, "enviar cobrança") até a
 * régua de cobrança ser decidida. A fatura aberta já aparece no painel e no
 * portal do cliente, que gera o PIX quando ele abre.
 *
 * Pode rodar quantas vezes quiser: a chave única (assinatura, competência,
 * tipo) garante uma fatura só, e o vencimento só troca quem ainda está `OPEN`.
 */

const FUSO = "America/Sao_Paulo";

function partesEmSaoPaulo(data: Date): { ano: number; mes: number; dia: number } {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(data);
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);
  return { ano: valor("year"), mes: valor("month"), dia: valor("day") };
}

/** AAAA-MM do dia de hoje no Brasil. Às 22h do dia 31 em UTC já é dia 1º lá fora, e não aqui. */
export function competenciaDe(data: Date): string {
  const { ano, mes } = partesEmSaoPaulo(data);
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

/** O dia de hoje no Brasil, como a coluna `due_date` (data pura) o guarda. */
export function hojeNoBrasil(data: Date): Date {
  const { ano, mes, dia } = partesEmSaoPaulo(data);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

const indiceDoMes = (ano: number, mes: number) => ano * 12 + (mes - 1);

/**
 * Esta assinatura tem fatura recorrente nesta competência?
 *
 * A primeira competência é o mês em que a assinatura começou — é a que a
 * contratação fatura na hora. A mensal segue todo mês; a anual só no mês de
 * aniversário. Depois de `endedAt`, nada.
 *
 * O mês de início é lido em UTC porque é assim que a contratação o grava.
 */
export function devidaNaCompetencia(
  assinatura: { startedAt: Date; endedAt: Date | null; billingCycle: string },
  competencia: string,
): boolean {
  const [ano, mes] = competencia.split("-").map(Number);
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) return false;

  const alvo = indiceDoMes(ano, mes);
  const inicio = indiceDoMes(assinatura.startedAt.getUTCFullYear(), assinatura.startedAt.getUTCMonth() + 1);
  if (alvo < inicio) return false;

  if (assinatura.endedAt) {
    const fim = indiceDoMes(assinatura.endedAt.getUTCFullYear(), assinatura.endedAt.getUTCMonth() + 1);
    if (alvo > fim) return false;
  }

  return assinatura.billingCycle === "YEARLY" ? (alvo - inicio) % 12 === 0 : true;
}

export type FaturaGerada = {
  faturaId: string | null;
  subscriptionId: string;
  organizationId: string;
  descricao: string;
  valor: number;
};

export type ResultadoDoFaturamento = {
  competencia: string;
  simulado: boolean;
  /** Criadas agora — ou, na simulação, as que seriam. */
  geradas: FaturaGerada[];
  jaExistiam: number;
  /** Assinatura ativa sem fatura nesta competência: anual fora do aniversário, ou que começa depois. */
  foraDaCompetencia: number;
  falhas: Array<{ subscriptionId: string; motivo: string }>;
};

export async function gerarFaturasDaCompetencia(opcoes: {
  competencia: string;
  simular?: boolean;
  /** Restringe a rodada. Serve para refazer uma assinatura e para os testes. */
  apenasAssinaturas?: string[];
}): Promise<ResultadoDoFaturamento> {
  const simular = Boolean(opcoes.simular);
  const assinaturas = await prisma.subscription.findMany({
    where: {
      status: "ACTIVE",
      ...(opcoes.apenasAssinaturas ? { id: { in: opcoes.apenasAssinaturas } } : {}),
    },
    select: {
      id: true,
      organizationId: true,
      description: true,
      amount: true,
      startedAt: true,
      endedAt: true,
      billingCycle: true,
      invoices: {
        where: { competence: opcoes.competencia, kind: { in: ["MONTHLY", "YEARLY"] } },
        select: { id: true, kind: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const resultado: ResultadoDoFaturamento = {
    competencia: opcoes.competencia,
    simulado: simular,
    geradas: [],
    jaExistiam: 0,
    foraDaCompetencia: 0,
    falhas: [],
  };

  for (const assinatura of assinaturas) {
    if (!devidaNaCompetencia(assinatura, opcoes.competencia)) {
      resultado.foraDaCompetencia += 1;
      continue;
    }
    if (assinatura.invoices.some((f) => f.kind === recorrenteDe(assinatura.billingCycle))) {
      resultado.jaExistiam += 1;
      continue;
    }

    const linha = {
      subscriptionId: assinatura.id,
      organizationId: assinatura.organizationId,
      descricao: assinatura.description,
      valor: Number(assinatura.amount),
    };
    if (simular) {
      resultado.geradas.push({ faturaId: null, ...linha });
      continue;
    }

    // Uma assinatura que falha não segura as outras: a rodada segue e a falha
    // volta no resultado, que é o que o agendador registra.
    try {
      const fatura = await garantirFatura({ subscriptionId: assinatura.id, competencia: opcoes.competencia });
      if (!fatura) {
        resultado.falhas.push({ subscriptionId: assinatura.id, motivo: "a assinatura deixou de estar ativa durante a rodada" });
        continue;
      }
      await prisma.operationsAuditEvent.create({
        data: {
          organizationId: assinatura.organizationId,
          action: "FATURA_GERADA_PELA_ROTINA",
          entityType: "SubscriptionInvoice",
          entityId: fatura.id,
          metadata: {
            subscriptionId: assinatura.id,
            competencia: opcoes.competencia,
            valor: linha.valor,
            vencimento: fatura.dueDate.toISOString().slice(0, 10),
          },
        },
      });
      resultado.geradas.push({ faturaId: fatura.id, ...linha });
    } catch (erro) {
      resultado.falhas.push({
        subscriptionId: assinatura.id,
        motivo: erro instanceof Error ? erro.message.slice(0, 200) : "erro desconhecido",
      });
    }
  }

  return resultado;
}

export type ResultadoDoVencimento = {
  hoje: string;
  simulado: boolean;
  vencidas: Array<{ faturaId: string; organizationId: string; competencia: string; vencimento: string }>;
};

/**
 * Passa para `OVERDUE` a fatura aberta que venceu ontem ou antes.
 *
 * Vencer no dia 10 quer dizer que o dia 10 inteiro ainda é prazo. `OVERDUE`
 * continua pagável e continua contando como em aberto em todo lugar que soma
 * dívida — o que muda é a tela dizer "em atraso" sem ninguém comparar datas.
 */
export async function marcarFaturasVencidas(opcoes: {
  agora?: Date;
  simular?: boolean;
  apenasAssinaturas?: string[];
} = {}): Promise<ResultadoDoVencimento> {
  const hoje = hojeNoBrasil(opcoes.agora ?? new Date());
  const simular = Boolean(opcoes.simular);

  const abertas = await prisma.subscriptionInvoice.findMany({
    where: {
      status: "OPEN",
      dueDate: { lt: hoje },
      ...(opcoes.apenasAssinaturas ? { subscriptionId: { in: opcoes.apenasAssinaturas } } : {}),
    },
    select: {
      id: true,
      competence: true,
      dueDate: true,
      subscription: { select: { organizationId: true } },
    },
    orderBy: { dueDate: "asc" },
  });

  const resultado: ResultadoDoVencimento = { hoje: hoje.toISOString().slice(0, 10), simulado: simular, vencidas: [] };

  for (const fatura of abertas) {
    const linha = {
      faturaId: fatura.id,
      organizationId: fatura.subscription.organizationId,
      competencia: fatura.competence,
      vencimento: fatura.dueDate.toISOString().slice(0, 10),
    };
    if (!simular) {
      // `updateMany` com o status na condição: se a fatura foi paga entre a
      // leitura e aqui, nada muda e nenhum rastro é gravado.
      const { count } = await prisma.subscriptionInvoice.updateMany({
        where: { id: fatura.id, status: "OPEN" },
        data: { status: "OVERDUE" },
      });
      if (count !== 1) continue;
      await prisma.operationsAuditEvent.create({
        data: {
          organizationId: linha.organizationId,
          action: "FATURA_VENCIDA",
          entityType: "SubscriptionInvoice",
          entityId: fatura.id,
          metadata: { competencia: linha.competencia, vencimento: linha.vencimento },
        },
      });
    }
    resultado.vencidas.push(linha);
  }

  return resultado;
}
