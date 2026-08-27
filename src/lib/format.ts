/**
 * Formata em reais por padrão, mas aceita a moeda da conta.
 *
 * A Wise trouxe EUR e USD para dentro do módulo, e um valor em euro impresso
 * com "R$" na frente é pior que valor nenhum: parece conferido e está errado.
 */
export function formatCurrency(
  value: number | string | null | undefined,
  currency = "BRL",
) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(Number(value ?? 0));
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "Ainda não sincronizado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

export function formatShortDate(value: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}
