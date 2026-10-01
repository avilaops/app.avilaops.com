/**
 * CNPJ válido e único para fixture de teste.
 *
 * Antes, as fixtures usavam `${Date.now()}`.slice(0, 14): catorze dígitos que
 * davam unicidade e não eram CNPJ de verdade. Com a validação do dígito
 * verificador dentro do banco
 * (migração `20261001200000_cadastro_e_fiscal_do_cliente`), o Postgres recusa
 * esses números — e tem razão: nenhum cliente real poderia ter um.
 *
 * A base continua vindo do relógio, para não repetir entre execuções; o que
 * muda é que os dois últimos dígitos passam a ser calculados.
 */

function digitoVerificador(base: string, pesos: number[]): number {
  let soma = 0;
  for (let i = 0; i < pesos.length; i += 1) {
    soma += (base.charCodeAt(i) - 48) * pesos[i];
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cnpjDeTeste(semente?: string): string {
  const base = `${semente ?? ""}${Date.now()}${Math.floor(Math.random() * 1e9)}`
    .replace(/\D/g, "")
    .slice(-12)
    .padStart(12, "1");

  const primeiro = digitoVerificador(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = digitoVerificador(`${base}${primeiro}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

  return `${base}${primeiro}${segundo}`;
}
