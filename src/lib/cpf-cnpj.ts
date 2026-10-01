/**
 * CPF e CNPJ: normalização e dígito verificador.
 *
 * A mesma regra existe dentro do banco, em `operations.cpf_valido`,
 * `operations.cnpj_valido` e `operations.documento_valido`. Não é duplicação
 * por descuido: importação, n8n e correção manual por SQL não passam por aqui,
 * e é por ali que entra o documento errado que ninguém digitou numa tela.
 * Mudar uma das duas implementações exige mudar a outra.
 */

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Documento sem pontuação e em maiúsculas.
 *
 * Maiúsculas porque desde julho de 2026 o CNPJ pode ter letras (IN RFB
 * 2.229/2024): as doze primeiras posições são alfanuméricas e só os dois
 * dígitos verificadores continuam numéricos.
 */
export function normalizarDocumento(value: string): string {
  return value.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const digits = cpf.split("").map(Number);
  const check = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += digits[i] * (length + 1 - i);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return check(9) === digits[9] && check(10) === digits[10];
}

export function isValidCnpj(value: string): boolean {
  const cnpj = normalizarDocumento(value);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj)) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  // O valor de cada caractere é o código ASCII menos 48: '0' vale 0 e 'A' vale
  // 17. Para um CNPJ só de dígitos isso dá exatamente o cálculo antigo.
  const valores = cnpj.split("").map((caractere) => caractere.charCodeAt(0) - 48);
  const check = (length: number) => {
    const weights =
      length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += valores[i] * weights[i];
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return check(12) === valores[12] && check(13) === valores[13];
}

export type CpfCnpjKind = "CPF" | "CNPJ";

/**
 * Diz se o texto é CPF ou CNPJ, devolve o documento normalizado e se o dígito
 * verificador fecha. `null` quando o tamanho não é de nenhum dos dois — aí não
 * há o que validar.
 */
export function classifyCpfCnpj(
  value: string,
): { kind: CpfCnpjKind; documento: string; valid: boolean } | null {
  const documento = normalizarDocumento(value);
  if (documento.length === 11) {
    return { kind: "CPF", documento, valid: isValidCpf(documento) };
  }
  if (documento.length === 14) {
    return { kind: "CNPJ", documento, valid: isValidCnpj(documento) };
  }
  return null;
}
