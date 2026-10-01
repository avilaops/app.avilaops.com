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

/**
 * Percentual em pt-BR: "29,2%", nunca "29.2%". Recebe de 0 a 100, que é como
 * os painéis calculam; a conversão para fração fica aqui, num lugar só.
 */
export function formatPercent(value: number | null | undefined, casas = 1) {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format((value ?? 0) / 100);
}

/** Número inteiro em pt-BR, sem zero à esquerda: "8", "1.234". */
export function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR").format(value ?? 0);
}

/**
 * Valor abreviado para eixo de gráfico: "R$ 3,5 mil", "R$ 1,2 mi". No eixo o
 * que importa é a ordem de grandeza; o valor exato fica no tooltip.
 */
export function formatCompactCurrency(value: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** Data sem hora: "28/09/2026". */
export function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

/** Só a hora: "09:26". */
export function formatTime(value: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

/**
 * Dia do calendário em São Paulo, no formato "2026-09-28".
 *
 * `toISOString().slice(0, 10)` dá o dia em UTC: um Pix das 22h caía no dia
 * seguinte do gráfico. Agrupar por dia tem de usar o dia de quem lê.
 */
export function diaEmSaoPaulo(value: Date | string) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
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
