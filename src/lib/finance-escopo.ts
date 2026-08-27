/**
 * Escopo de uma movimentação: de quem é o dinheiro.
 *
 * A conta que alimenta este módulo é uma só — a Wise pessoal do Nicolas paga
 * mercado e paga o Porkbun no mesmo cartão — e não adianta fingir que existem
 * dois extratos. O que resolve não é separar arquivos, é etiquetar linha a
 * linha: `EMPRESA` entra no resultado da Ávila, `PESSOAL` fica de fora,
 * `INTERNO` é dinheiro andando entre contas do próprio grupo e não pode virar
 * nem receita nem despesa (senão o mesmo real aparece duas vezes, uma no Éfi e
 * outra na Wise).
 *
 * `INDEFINIDO` é proposital: regra que chuta errado é pior que fila de
 * triagem. O que a regra não reconhece com segurança fica esperando decisão
 * humana na tela, e a decisão humana (`scopeSource = "MANUAL"`) nunca é
 * sobrescrita por reimportação.
 */
export type FinanceScope = "EMPRESA" | "PESSOAL" | "INTERNO" | "INDEFINIDO";

export const FINANCE_SCOPES: FinanceScope[] = [
  "EMPRESA",
  "PESSOAL",
  "INTERNO",
  "INDEFINIDO",
];

export const SCOPE_LABELS: Record<FinanceScope, string> = {
  EMPRESA: "Empresa",
  PESSOAL: "Pessoal",
  INTERNO: "Entre contas",
  INDEFINIDO: "A classificar",
};

export function isFinanceScope(value: unknown): value is FinanceScope {
  return typeof value === "string" && FINANCE_SCOPES.includes(value as FinanceScope);
}

/** Nomes que representam o próprio Nicolas ou o CNPJ da Ávila Ops. */
const CONTAS_PROPRIAS = [
  /^nicolas rosa avila barros$/,
  /^nicolas rosa$/,
  /^nicolas avila/,
  // Wise escreve o CNPJ com e sem pontuação, dependendo do tipo de linha.
  /^67[.\s]?954[.\s]?417/,
  /avila ops/,
];

/**
 * Fornecedor de operação: infraestrutura, domínio, SaaS de trabalho e quem
 * cuida da contabilidade. Custo que existe porque a Ávila existe.
 */
const FORNECEDORES_EMPRESA: Array<[RegExp, string]> = [
  [/porkbun/, "Domínios"],
  [/namecheap|godaddy|registro\.?br|nucleo de informacao e coordenacao|nic\.?br/, "Domínios"],
  [/cloudflare/, "Infraestrutura"],
  [/hetzner|digitalocean|linode|vultr|ovh\b|contabo/, "Infraestrutura"],
  [/amazon web services|\baws\b|google cloud|microsoft azure/, "Infraestrutura"],
  [/github|gitlab|vercel|netlify|supabase|railway|render\.com|docker/, "Infraestrutura"],
  [/openai|anthropic|claude\.ai|cursor|midjourney|perplexity|elevenlabs|replicate/, "IA"],
  [/twilio|sendgrid|resend|mailgun|postmark|brevo/, "Comunicação"],
  [/n8n\b|zapier|make\.com|notion|linear|sentry|jetbrains|figma|adobe|canva/, "Ferramentas"],
  [/contabilidade|contabil|assessoria empr/, "Contabilidade"],
  // "DAS" solto é armadilha: casaria "Casa DAS Frutas". Só vale colado ao que
  // identifica a guia de verdade.
  [
    /receita federal|simples nacional|das mei|\bdarf\b|prefeitura de|\bfgts\b/,
    "Impostos",
  ],
];

/**
 * Comércio que só existe na vida pessoal.
 *
 * Serve para as linhas que a Wise jogou em "Geral" — o mesmo Uber aparece ora
 * como "Transporte", ora sem categoria nenhuma, e sem esta lista metade das
 * corridas cairia na fila de triagem sem necessidade. Só entram aqui ramos que
 * não têm leitura de despesa da operação; hotel e passagem ficam de fora de
 * propósito, porque viagem a trabalho existe.
 */
const COMERCIO_PESSOAL: Array<[RegExp, string]> = [
  [/\buber\b|99 ?app|99 ?tecnologia|cabify|blablacar/, "Transporte"],
  [/ifood|rappi|zé delivery|ze delivery/, "Alimentação"],
  [/drogaria|drogari|droga ?raia|\braia\d|farmacia|drogasil|pague ?menos/, "Saúde"],
  [
    /supermercado|mercado municipal|hortifruti|horti|acougue|padaria|casa das frutas|conveniencia/,
    "Mercado",
  ],
  [/pizzaria|pizzaaria|sushi|churrascaria|lanchonete|restaurante|bistro|cafeteria/, "Alimentação"],
  [/bebidas|adega|distribuidora de bebidas/, "Alimentação"],
  [/netflix|spotify|disney|hbo ?max|prime ?video|steam ?games|playstation|xbox/, "Entretenimento"],
  [/petshop|pet ?shop|racoes|racao|pitbullracoes/, "Pet"],
];

/**
 * Categorias que a própria Wise já classifica como vida pessoal. São as que o
 * extrato acerta sozinho: mercado, restaurante, farmácia, transporte.
 */
const CATEGORIAS_PESSOAIS = new Set([
  "Compras no mercado",
  "Alimentação (restaurantes e afins)",
  "Transporte",
  "Cuidados pessoais",
  "Entretenimento",
  "Viagens",
  "Família",
  "Habitação",
  "Dinheiro em espécie",
]);

/** Categorias que não dizem nada — a decisão tem de vir do nome ou da tela. */
const CATEGORIAS_NEUTRAS = new Set(["Geral", "Contas", "Compras", ""]);

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type ScopeSuggestion = {
  scope: FinanceScope;
  /** Categoria de negócio sugerida, quando a regra sabe dizer qual é. */
  category: string | null;
  /** Regra que decidiu, para a auditoria conseguir explicar a etiqueta. */
  rule: string;
};

/**
 * Sugere o escopo de uma movimentação a partir do que o extrato entrega.
 *
 * A ordem importa: conta própria ganha de tudo (é a regra que evita contar o
 * mesmo dinheiro duas vezes), depois fornecedor conhecido, e só então a
 * categoria do extrato. Nada reconhecido devolve `INDEFINIDO`.
 */
export function suggestScope(input: {
  /**
   * A OUTRA ponta da movimentação — quem recebeu, numa saída; quem mandou,
   * numa entrada. Nunca o titular da conta: numa saída o remetente é sempre o
   * próprio Nicolas, e olhar para ele marcaria todo gasto do cartão como
   * "entre contas".
   */
  counterpartyName?: string | null;
  description?: string | null;
  category?: string | null;
  reference?: string | null;
  isInternalTransfer?: boolean;
}): ScopeSuggestion {
  if (input.isInternalTransfer) {
    return { scope: "INTERNO", category: "Conversão de saldo", rule: "conversao-wise" };
  }

  const counterparty = normalize(input.counterpartyName);

  for (const pattern of CONTAS_PROPRIAS) {
    if (pattern.test(counterparty)) {
      return {
        scope: "INTERNO",
        category: "Transferência entre contas",
        rule: "conta-propria",
      };
    }
  }

  const haystack = `${counterparty} ${normalize(input.description)} ${normalize(input.reference)}`;
  for (const [pattern, category] of FORNECEDORES_EMPRESA) {
    if (pattern.test(haystack)) {
      return { scope: "EMPRESA", category, rule: `fornecedor:${pattern.source.slice(0, 24)}` };
    }
  }

  for (const [pattern, category] of COMERCIO_PESSOAL) {
    if (pattern.test(counterparty)) {
      return { scope: "PESSOAL", category, rule: `comercio:${pattern.source.slice(0, 24)}` };
    }
  }

  const category = (input.category ?? "").trim();
  if (CATEGORIAS_PESSOAIS.has(category)) {
    return { scope: "PESSOAL", category, rule: `categoria:${category}` };
  }
  if (category && !CATEGORIAS_NEUTRAS.has(category)) {
    return { scope: "INDEFINIDO", category, rule: `categoria-nao-mapeada:${category}` };
  }

  return { scope: "INDEFINIDO", category: category || null, rule: "sem-regra" };
}
