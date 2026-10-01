import { diaEmSaoPaulo } from "@/lib/format";

export type PontoFluxo = {
  /** Primeiro dia do intervalo, "2026-09-28". */
  dia: string;
  entradas: number;
  saidas: number;
};

type Movimento = { occurredAt: Date; direction: string; amount: number | string | { toString(): string } };

const UM_DIA = 24 * 60 * 60 * 1000;

/**
 * Série do gráfico de fluxo com **todos** os dias do período, inclusive os
 * sem movimento.
 *
 * O gráfico antigo só tinha ponto nos dias com movimentação: cinco pontos
 * ligados por linha em 30 dias, e a linha entre dois deles sugeria dinheiro
 * entrando em dias em que nada entrou. Dia vazio é informação e aparece como
 * zero.
 *
 * No período de um ano, 365 barras viram fio; ali o balde é a semana
 * (`passoDias = 7`), e o rótulo do ponto é o primeiro dia dela.
 */
export function serieDoFluxo(
  movimentos: Movimento[],
  inicio: Date,
  dias: number,
  passoDias = 1,
): PontoFluxo[] {
  const pontos: PontoFluxo[] = [];
  const indice = new Map<string, PontoFluxo>();
  const baldes = Math.ceil(dias / passoDias);
  // Começa no dia de hoje e volta, para o último balde terminar hoje.
  const hoje = Date.now();
  for (let b = baldes - 1; b >= 0; b -= 1) {
    const ponto = { dia: diaEmSaoPaulo(new Date(hoje - (b * passoDias + passoDias - 1) * UM_DIA)), entradas: 0, saidas: 0 };
    pontos.push(ponto);
    for (let d = 0; d < passoDias; d += 1) {
      indice.set(diaEmSaoPaulo(new Date(hoje - (b * passoDias + d) * UM_DIA)), ponto);
    }
  }

  for (const movimento of movimentos) {
    if (movimento.occurredAt < inicio) continue;
    const ponto = indice.get(diaEmSaoPaulo(movimento.occurredAt));
    if (!ponto) continue;
    const valor = Number(movimento.amount.toString());
    if (movimento.direction === "CREDIT") ponto.entradas += valor;
    else ponto.saidas += valor;
  }

  // Centavos de float somados viram 0.30000000000000004 no tooltip.
  for (const ponto of pontos) {
    ponto.entradas = Math.round(ponto.entradas * 100) / 100;
    ponto.saidas = Math.round(ponto.saidas * 100) / 100;
  }
  return pontos;
}
