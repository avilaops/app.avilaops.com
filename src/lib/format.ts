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

/**
 * "1 loja" / "6 lojas" — o número junto da palavra na forma certa.
 *
 * Existe porque `${n} loja(s)` é placeholder de plural chegando ao usuário, e
 * isso lê como template, não como produto. Quem sabe o número é quem sabe a
 * forma, então as duas vêm juntas: em português o plural não sai de uma regra
 * ("útil" → "úteis"), e um pluralizador esperto erraria calado.
 */
export function contar(quantidade: number, singular: string, plural: string): string {
  const n = quantidade.toLocaleString("pt-BR");
  return `${n} ${Math.abs(quantidade) === 1 ? singular : plural}`;
}

/** Ligações que não abrem palavra no meio de um nome próprio em português. */
const PARTICULAS = new Set([
  "a", "as", "o", "os", "à", "às", "ao", "aos",
  "da", "das", "de", "di", "do", "dos", "du",
  "e", "em", "na", "nas", "no", "nos",
  "com", "para", "por", "sem", "sob", "sobre",
]);

/**
 * "VEDASHOW ROLAMENTOS" → "Vedashow Rolamentos".
 *
 * O nome do cliente entra por três portas — digitado à mão, lido do CNPJ na
 * Receita (que devolve tudo em caixa alta) e importado de planilha — e a
 * lista mostrava as três juntas: "VEDASHOW" gritando ao lado de "Alô
 * Barbeiro". Caixa alta ainda ocupa mais largura por letra, e no celular o
 * nome é justamente quem cede espaço primeiro na linha.
 *
 * Isto é exibição, não gravação: o que está no banco continua como veio, e a
 * razão social (documento) segue impressa como está registrada.
 *
 * Duas exceções à regra "primeira maiúscula, resto minúsculo":
 * - partícula no meio do nome fica minúscula ("Engreaco Indústria e Comércio",
 *   não "E Comércio");
 * - palavra com maiúscula no meio foi escolha de quem digitou e não se mexe
 *   ("iFood" não vira "Ifood").
 */
export function nomeProprio(valor: string | null | undefined): string {
  const texto = (valor ?? "").trim();
  if (!texto) return "";

  return texto
    .split(/(\s+)/)
    .map((pedaco, indice) => {
      if (/^\s+$/.test(pedaco) || pedaco === "") return pedaco;
      // "iFood", "McDonald's": minúscula seguida de maiúscula é intenção.
      if (/\p{Ll}\p{Lu}/u.test(pedaco)) return pedaco;

      const minusculo = pedaco.toLocaleLowerCase("pt-BR");
      const soLetras = minusculo.replace(/[^\p{L}]/gu, "");
      if (indice > 0 && PARTICULAS.has(soLetras)) return minusculo;

      // Maiúscula depois de espaço, hífen ou apóstrofo — e só na primeira
      // letra de cada uma dessas partes.
      return minusculo.replace(
        /(^|[-'’])(\p{L})/gu,
        (_todo, antes: string, letra: string) =>
          `${antes}${letra.toLocaleUpperCase("pt-BR")}`,
      );
    })
    .join("");
}
