export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
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
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;

  const digits = cnpj.split("").map(Number);
  const check = (length: number) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += digits[i] * weights[i];
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return check(12) === digits[12] && check(13) === digits[13];
}

export type CpfCnpjKind = "CPF" | "CNPJ";

export function classifyCpfCnpj(value: string): { kind: CpfCnpjKind; digits: string; valid: boolean } | null {
  const digits = onlyDigits(value);
  if (digits.length === 11) return { kind: "CPF", digits, valid: isValidCpf(digits) };
  if (digits.length === 14) return { kind: "CNPJ", digits, valid: isValidCnpj(digits) };
  return null;
}
