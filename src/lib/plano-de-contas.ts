/**
 * Plano de contas da Ávila: a árvore que transforma extrato em resultado.
 *
 * Até aqui o módulo financeiro respondia "quanto entrou e quanto saiu" — que
 * é caixa, não resultado. A diferença entre as duas perguntas é esta árvore:
 * DRE é, literalmente, o agrupamento dos lançamentos por ela. Sem a árvore
 * não existe margem, não existe resultado operacional e não existe EBITDA.
 *
 * A árvore mora no código, e não numa tabela, de propósito. Ela muda de ano
 * em ano, não de semana em semana; em código ela é versionada, revisada em PR
 * e testada. Conta nova é uma linha aqui e uma migração de nada. Tabela de
 * plano de contas editável em tela resolveria um problema que a casa ainda
 * não tem, e traria um que ela não quer: duas pessoas renomeando conta
 * enquanto o relatório do mês fecha.
 *
 * `categoria` continua existindo nos lançamentos, como texto do extrato. Ela
 * diz de onde veio; a conta diz o que é. As regras de `finance-escopo.ts` já
 * escrevem a categoria, então o mapa abaixo aproveita esse trabalho em vez de
 * pedir classificação manual de novo.
 */

/** Onde a conta entra no demonstrativo. A ordem aqui é a ordem do DRE. */
export type GrupoDre =
  | "RECEITA"
  | "DEDUCAO"
  | "CUSTO"
  | "DESPESA"
  | "FINANCEIRO"
  | "SOCIO"
  | "NAO_OPERACIONAL";

export type Conta = {
  codigo: string;
  rotulo: string;
  grupo: GrupoDre;
  /** O que a conta significa, para a tela explicar sem manual à parte. */
  ajuda: string;
};

/**
 * A distinção que mais importa nesta árvore é entre CUSTO e DESPESA.
 *
 * Custo é o que existe porque o cliente existe: o servidor que hospeda o site
 * dele, o domínio que está no nome dele, o token de IA gasto na entrega. Se a
 * Ávila dobrar de clientes, dobra junto.
 *
 * Despesa é o que existe porque a Ávila existe: contabilidade, ferramenta de
 * trabalho, pró-labore. Dobrar de clientes não dobra a contabilidade.
 *
 * Sem essa separação não há margem bruta — e margem bruta é o número que diz
 * se vale a pena vender mais do mesmo.
 */
export const PLANO_DE_CONTAS: readonly Conta[] = [
  {
    codigo: "1.1",
    rotulo: "Receita recorrente",
    grupo: "RECEITA",
    ajuda: "Mensalidade e assinatura: o que se repete sozinho todo mês.",
  },
  {
    codigo: "1.2",
    rotulo: "Receita de projeto",
    grupo: "RECEITA",
    ajuda: "Trabalho com começo e fim: site, implantação, peça avulsa.",
  },
  {
    codigo: "1.9",
    rotulo: "Outras receitas",
    grupo: "RECEITA",
    ajuda: "Entrada de empresa que não é venda de serviço.",
  },
  {
    codigo: "2.1",
    rotulo: "Impostos sobre a receita",
    grupo: "DEDUCAO",
    ajuda: "DAS do Simples e retenções: saem do faturamento antes de tudo.",
  },
  {
    codigo: "3.1",
    rotulo: "Infraestrutura",
    grupo: "CUSTO",
    ajuda: "Servidor, CDN e armazenamento que sustentam a entrega.",
  },
  {
    codigo: "3.2",
    rotulo: "Domínios",
    grupo: "CUSTO",
    ajuda: "Registro e renovação de domínio, inclusive os que estão no nome do cliente.",
  },
  {
    codigo: "3.3",
    rotulo: "Inteligência artificial",
    grupo: "CUSTO",
    ajuda: "Modelos e APIs consumidos para produzir o que é entregue.",
  },
  {
    codigo: "3.4",
    rotulo: "Comunicação com o cliente",
    grupo: "CUSTO",
    ajuda: "E-mail transacional, WhatsApp e SMS que a operação dispara.",
  },
  {
    codigo: "4.1",
    rotulo: "Ferramentas de trabalho",
    grupo: "DESPESA",
    ajuda: "Assinatura que a casa usa para trabalhar, não para entregar.",
  },
  {
    codigo: "4.2",
    rotulo: "Contabilidade e assessoria",
    grupo: "DESPESA",
    ajuda: "Escritório contábil, jurídico e consultoria.",
  },
  {
    codigo: "4.3",
    rotulo: "Pró-labore",
    grupo: "DESPESA",
    ajuda: "Retirada pelo trabalho, com encargos. É despesa; lucro distribuído não é.",
  },
  {
    codigo: "4.9",
    rotulo: "Outras despesas",
    grupo: "DESPESA",
    ajuda: "Despesa da operação que não cabe nas de cima.",
  },
  {
    codigo: "5.1",
    rotulo: "Tarifas e taxas",
    grupo: "FINANCEIRO",
    ajuda: "Tarifa bancária, taxa de Pix, corte do meio de pagamento, IOF.",
  },
  {
    codigo: "5.2",
    rotulo: "Juros e multas",
    grupo: "FINANCEIRO",
    ajuda: "Juro pago por atraso e multa contratual.",
  },
  {
    codigo: "6.1",
    rotulo: "Distribuição de lucros",
    grupo: "SOCIO",
    ajuda: "Dinheiro que sai para o sócio depois do resultado. Não é despesa e não entra no DRE.",
  },
  {
    codigo: "6.2",
    rotulo: "Aporte do sócio",
    grupo: "SOCIO",
    ajuda: "Dinheiro que o sócio põe na empresa. Não é receita.",
  },
  {
    codigo: "9.9",
    rotulo: "A classificar",
    grupo: "NAO_OPERACIONAL",
    ajuda: "Ainda sem conta. Aparece no DRE como linha própria, nunca diluído no resultado.",
  },
] as const;

/** Conta de quem ainda não foi classificado. Existe para não sumir com dinheiro. */
export const CONTA_A_CLASSIFICAR = "9.9";

const POR_CODIGO = new Map(PLANO_DE_CONTAS.map((conta) => [conta.codigo, conta]));

export function contaPorCodigo(codigo: string | null | undefined): Conta | null {
  return codigo ? (POR_CODIGO.get(codigo) ?? null) : null;
}

export function ehCodigoDeConta(valor: unknown): valor is string {
  return typeof valor === "string" && POR_CODIGO.has(valor);
}

/**
 * Categoria do extrato → conta.
 *
 * As regras de escopo já rotulam a linha ("Domínios", "Infraestrutura",
 * "Contabilidade"…) e ninguém nunca somou esses rótulos. O mapa aqui é o que
 * aproveita a classificação que já existe: nenhum histórico precisa ser
 * reclassificado à mão para o primeiro DRE aparecer.
 */
const CATEGORIA_PARA_CONTA: Record<string, string> = {
  Domínios: "3.2",
  Infraestrutura: "3.1",
  IA: "3.3",
  Comunicação: "3.4",
  Ferramentas: "4.1",
  Contabilidade: "4.2",
  Impostos: "2.1",
};

function normalizar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

const CATEGORIA_NORMALIZADA = new Map(
  Object.entries(CATEGORIA_PARA_CONTA).map(([categoria, codigo]) => [
    normalizar(categoria),
    codigo,
  ]),
);

/**
 * Sugere a conta a partir do que o extrato já rotulou.
 *
 * Entrada sem categoria conhecida vira receita de projeto, não "a classificar":
 * dinheiro que entra numa conta de empresa é venda até prova em contrário, e a
 * prova em contrário (aporte, reembolso) é rara e se corrige na tela. Saída
 * desconhecida fica a classificar de propósito — chutar despesa é o jeito
 * rápido de o resultado mentir para baixo.
 */
export function contaSugerida(input: {
  categoria?: string | null;
  direcao: "CREDIT" | "DEBIT" | "RECEIVABLE" | "PAYABLE";
}): string {
  const entrada = input.direcao === "CREDIT" || input.direcao === "RECEIVABLE";
  const categoria = (input.categoria ?? "").trim();

  if (categoria) {
    const codigo = CATEGORIA_NORMALIZADA.get(normalizar(categoria));
    if (codigo) return codigo;
  }

  return entrada ? "1.2" : CONTA_A_CLASSIFICAR;
}

/** Rótulo e ordem de cada grupo no demonstrativo. */
export const GRUPOS_DRE: ReadonlyArray<{ grupo: GrupoDre; rotulo: string }> = [
  { grupo: "RECEITA", rotulo: "Receita bruta" },
  { grupo: "DEDUCAO", rotulo: "Deduções da receita" },
  { grupo: "CUSTO", rotulo: "Custos diretos" },
  { grupo: "DESPESA", rotulo: "Despesas operacionais" },
  { grupo: "FINANCEIRO", rotulo: "Resultado financeiro" },
  { grupo: "SOCIO", rotulo: "Movimento de sócio" },
  { grupo: "NAO_OPERACIONAL", rotulo: "A classificar" },
];

export function contasDoGrupo(grupo: GrupoDre): Conta[] {
  return PLANO_DE_CONTAS.filter((conta) => conta.grupo === grupo);
}
