export function rotuloDoCiclo(ciclo: string) {
  const rotulos: Record<string, string> = {
    MONTHLY: "mensal", YEARLY: "anual", ONE_TIME: "pagamento único",
    TWO_YEARS: "a cada 2 anos", FOUR_YEARS: "a cada 4 anos", NONE: "sem recorrência",
  };
  return rotulos[ciclo] ?? ciclo;
}
