import { prisma } from "@/lib/prisma";
import {
  CONTA_A_CLASSIFICAR,
  contaPorCodigo,
  contaSugerida,
  GRUPOS_DRE,
  type GrupoDre,
} from "@/lib/plano-de-contas";

/**
 * Demonstrativo de resultado, por competência.
 *
 * O painel do Financeiro responde caixa: o que entrou e o que saiu, no dia em
 * que aconteceu. Isto aqui responde outra pergunta — quanto a operação deu de
 * resultado no mês —, e as duas divergem sempre que o dinheiro anda em data
 * diferente do fato que o gerou. O domínio anual pago em janeiro é caixa de
 * janeiro e despesa de doze meses; a mensalidade que o cliente atrasou é
 * receita do mês combinado, não do mês em que ele pagou.
 *
 * DE ONDE VÊM AS LINHAS, E POR QUE DE DOIS LUGARES
 *
 * O lançamento (conta a pagar ou a receber) é o fato: tem competência, tem
 * conta, existe antes de o dinheiro andar. É a fonte certa. Só que a maior
 * parte do que a Ávila gasta hoje nunca virou lançamento — nasce direto no
 * extrato, com a categoria que a regra escreveu.
 *
 * Um DRE que lesse só lançamento sairia quase vazio, e vazio por construção é
 * pior que impreciso: ninguém confere um relatório que sabe estar incompleto.
 * Então a movimentação bancária **sem lançamento por trás** também entra, pela
 * data em que ocorreu. Cada linha do demonstrativo diz quanto veio de cada
 * origem, porque um real reconhecido por competência e um real reconhecido
 * porque saiu da conta não têm a mesma qualidade de informação.
 *
 * O que impede contar duas vezes é a conciliação: movimentação já vinculada a
 * um lançamento (`referenceType = "LEDGER"`) não entra, porque o lançamento
 * dela já entrou.
 */

export type OrigemLinha = "COMPETENCIA" | "CAIXA";

export type LinhaDre = {
  conta: string;
  /** AAAA-MM */
  mes: string;
  /** Positivo entra, negativo sai. */
  valor: number;
  origem: OrigemLinha;
};

export function chaveDoMes(data: Date): string {
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Meses de um intervalo, inclusive as duas pontas. */
export function mesesNoIntervalo(inicio: Date, fim: Date): string[] {
  const meses: string[] = [];
  const cursor = new Date(
    Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), 1),
  );
  const limite = Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth(), 1);
  while (cursor.getTime() <= limite) {
    meses.push(chaveDoMes(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return meses;
}

/**
 * Divide um valor em N meses sem perder centavo.
 *
 * `600 / 7` não fecha em duas casas, e um DRE cujas parcelas não somam o total
 * é um DRE que ninguém assina. A sobra vai toda para o primeiro mês: é a
 * convenção mais simples de conferir de cabeça.
 */
export function ratear(valor: number, meses: number): number[] {
  const quantidade = Math.max(1, Math.trunc(meses));
  const centavos = Math.round(valor * 100);
  const base = Math.trunc(centavos / quantidade);
  const sobra = centavos - base * quantidade;
  return Array.from({ length: quantidade }, (_, indice) =>
    ((indice === 0 ? base + sobra : base) / 100),
  );
}

/** Competência de um lançamento, mês a mês, já rateada. */
export function competenciaDoLancamento(entrada: {
  amount: number;
  dueDate: Date;
  competenceStart: Date | null;
  competenceMonths: number | null;
}): Array<{ mes: string; valor: number }> {
  // Sem competência declarada, o vencimento é a melhor aproximação que existe
  // — e é a que o lançamento já tinha antes deste módulo.
  const inicio = entrada.competenceStart ?? entrada.dueDate;
  const meses = Math.max(1, entrada.competenceMonths ?? 1);
  const partes = ratear(entrada.amount, meses);

  return partes.map((valor, indice) => {
    const data = new Date(
      Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + indice, 1),
    );
    return { mes: chaveDoMes(data), valor };
  });
}

export type TotalDaConta = {
  conta: string;
  rotulo: string;
  total: number;
  porCompetencia: number;
  porCaixa: number;
};

export type GrupoTotalizado = {
  grupo: GrupoDre;
  rotulo: string;
  total: number;
  porCompetencia: number;
  porCaixa: number;
  contas: TotalDaConta[];
};

export type Dre = {
  meses: string[];
  grupos: GrupoTotalizado[];
  receitaBruta: number;
  deducoes: number;
  receitaLiquida: number;
  custos: number;
  margemBruta: number;
  despesas: number;
  /** Resultado operacional. Sem imobilizado, é o EBITDA desta casa. */
  resultadoOperacional: number;
  financeiro: number;
  resultadoLiquido: number;
  aClassificar: number;
  movimentoSocio: number;
  /** Quanto do demonstrativo veio de lançamento com competência. */
  cobertura: number;
};

/** Grupos em que gastar é o normal: o sinal se inverte para a linha ficar positiva. */
const GRUPOS_DE_SAIDA: ReadonlySet<GrupoDre> = new Set<GrupoDre>([
  "DEDUCAO",
  "CUSTO",
  "DESPESA",
  "FINANCEIRO",
]);

/** Monta o demonstrativo. Função pura: recebe linhas, devolve números. */
export function montarDre(linhas: LinhaDre[], meses: string[]): Dre {
  const dentro = new Set(meses);
  const porConta = new Map<string, { total: number; competencia: number; caixa: number }>();

  for (const linha of linhas) {
    if (!dentro.has(linha.mes)) continue;
    const codigo = contaPorCodigo(linha.conta) ? linha.conta : CONTA_A_CLASSIFICAR;
    const atual = porConta.get(codigo) ?? { total: 0, competencia: 0, caixa: 0 };
    atual.total += linha.valor;
    if (linha.origem === "COMPETENCIA") atual.competencia += linha.valor;
    else atual.caixa += linha.valor;
    porConta.set(codigo, atual);
  }

  const grupos: GrupoTotalizado[] = GRUPOS_DRE.map(({ grupo, rotulo }) => {
    const sinal = GRUPOS_DE_SAIDA.has(grupo) ? -1 : 1;
    const contas: TotalDaConta[] = [];

    for (const [codigo, valores] of porConta) {
      const conta = contaPorCodigo(codigo);
      if (!conta || conta.grupo !== grupo) continue;
      if (Math.abs(valores.total) < 0.005) continue;
      contas.push({
        conta: codigo,
        rotulo: conta.rotulo,
        total: arredondar(valores.total * sinal),
        porCompetencia: arredondar(valores.competencia * sinal),
        porCaixa: arredondar(valores.caixa * sinal),
      });
    }

    contas.sort((esquerda, direita) => direita.total - esquerda.total);

    return {
      grupo,
      rotulo,
      total: arredondar(contas.reduce((soma, item) => soma + item.total, 0)),
      porCompetencia: arredondar(
        contas.reduce((soma, item) => soma + item.porCompetencia, 0),
      ),
      porCaixa: arredondar(contas.reduce((soma, item) => soma + item.porCaixa, 0)),
      contas,
    };
  });

  const totalDe = (grupo: GrupoDre) =>
    grupos.find((item) => item.grupo === grupo)?.total ?? 0;

  const receitaBruta = totalDe("RECEITA");
  const deducoes = totalDe("DEDUCAO");
  const receitaLiquida = arredondar(receitaBruta - deducoes);
  const custos = totalDe("CUSTO");
  const margemBruta = arredondar(receitaLiquida - custos);
  const despesas = totalDe("DESPESA");
  const resultadoOperacional = arredondar(margemBruta - despesas);
  const financeiro = totalDe("FINANCEIRO");
  const resultadoLiquido = arredondar(resultadoOperacional - financeiro);

  const movimentado = grupos.reduce(
    (soma, grupo) => soma + Math.abs(grupo.porCompetencia) + Math.abs(grupo.porCaixa),
    0,
  );
  const competencia = grupos.reduce(
    (soma, grupo) => soma + Math.abs(grupo.porCompetencia),
    0,
  );

  return {
    meses,
    grupos,
    receitaBruta,
    deducoes,
    receitaLiquida,
    custos,
    margemBruta,
    despesas,
    resultadoOperacional,
    financeiro,
    resultadoLiquido,
    aClassificar: totalDe("NAO_OPERACIONAL"),
    movimentoSocio: totalDe("SOCIO"),
    cobertura: movimentado > 0 ? arredondar((competencia / movimentado) * 100) : 0,
  };
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * Lê do banco as linhas do período e monta o demonstrativo.
 *
 * `PESSOAL` e `INTERNO` ficam de fora por construção: o primeiro não é da
 * empresa e o segundo é o mesmo dinheiro andando entre contas próprias, que
 * viraria receita e despesa ao mesmo tempo.
 */
export async function getDre(inicio: Date, fim: Date): Promise<Dre> {
  const meses = mesesNoIntervalo(inicio, fim);
  const linhas: LinhaDre[] = [];

  // A competência pode começar antes do intervalo e alcançá-lo pelo rateio: o
  // domínio pago em janeiro ainda é despesa de setembro. Por isso a busca abre
  // uma janela maior para trás e o corte por mês acontece em `montarDre`.
  const inicioBusca = new Date(
    Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() - 24, 1),
  );

  const [lancamentos, movimentacoes] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: {
        scope: "EMPRESA",
        dueDate: { gte: inicioBusca, lte: fim },
      },
      select: {
        direction: true,
        amount: true,
        dueDate: true,
        category: true,
        accountCode: true,
        competenceStart: true,
        competenceMonths: true,
      },
    }),
    prisma.bankTransaction.findMany({
      where: {
        scope: "EMPRESA",
        occurredAt: { gte: inicio, lte: fim },
        // Movimentação já vinculada a um lançamento não entra: o lançamento
        // dela já entrou, e somar os dois contaria o mesmo dinheiro duas vezes.
        NOT: { reconciliation: { is: { referenceType: "LEDGER" } } },
      },
      select: {
        direction: true,
        amount: true,
        occurredAt: true,
        category: true,
        accountCode: true,
      },
    }),
  ]);

  for (const lancamento of lancamentos) {
    const valor = Number(lancamento.amount);
    if (!Number.isFinite(valor)) continue;
    const entrada = lancamento.direction === "RECEIVABLE";
    const conta =
      lancamento.accountCode ??
      contaSugerida({
        categoria: lancamento.category,
        direcao: entrada ? "RECEIVABLE" : "PAYABLE",
      });

    for (const parte of competenciaDoLancamento({
      amount: valor,
      dueDate: lancamento.dueDate,
      competenceStart: lancamento.competenceStart,
      competenceMonths: lancamento.competenceMonths,
    })) {
      linhas.push({
        conta,
        mes: parte.mes,
        valor: entrada ? parte.valor : -parte.valor,
        origem: "COMPETENCIA",
      });
    }
  }

  for (const movimentacao of movimentacoes) {
    const valor = Number(movimentacao.amount);
    if (!Number.isFinite(valor)) continue;
    const entrada = movimentacao.direction === "CREDIT";
    const conta =
      movimentacao.accountCode ??
      contaSugerida({
        categoria: movimentacao.category,
        direcao: entrada ? "CREDIT" : "DEBIT",
      });

    linhas.push({
      conta,
      mes: chaveDoMes(movimentacao.occurredAt),
      valor: entrada ? valor : -valor,
      origem: "CAIXA",
    });
  }

  return montarDre(linhas, meses);
}
