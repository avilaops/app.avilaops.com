/**
 * Quanto de um pagamento confirmado abate a fatura no ledger
 * (`core.payment_allocations`).
 *
 * Puro de propósito: é a regra que o gatilho `core.guard_allocation` cobra no
 * banco ("invoice overpaid" quando a soma das alocações passa do valor da
 * fatura), e dá para testar sem Postgres.
 */

type Dinheiro = number | { toString(): string };

/** Compara dinheiro em centavos: 60.1 + 39.9 em ponto flutuante não fecha 100. */
function centavos(valor: Dinheiro): number {
  return Math.round(Number(valor) * 100);
}

/**
 * O menor entre o principal da cobrança e o saldo em aberto da fatura, em
 * centavos.
 *
 * - Principal é `amount − interestAmount`: o juros do cartão parcelado é do
 *   pagador e não abate fatura.
 * - Saldo é `valor da fatura − já alocado por OUTROS pagamentos confirmados`.
 *   Não vem de `core.receivables`: a visão zera o `outstanding` de fatura
 *   `PAID`, e a baixa marca a fatura como paga antes de alimentar o ledger.
 *
 * Nunca negativo: fatura já coberta devolve 0, e quem chama não aloca.
 */
export function centavosAAlocar(
  cobranca: { amount: Dinheiro; interestAmount?: Dinheiro | null },
  valorDaFatura: Dinheiro,
  jaAlocado: Dinheiro | null | undefined,
): number {
  const principal = centavos(cobranca.amount) - centavos(cobranca.interestAmount ?? 0);
  const saldo = centavos(valorDaFatura) - centavos(jaAlocado ?? 0);
  return Math.max(0, Math.min(principal, saldo));
}
