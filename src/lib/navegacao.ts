/**
 * Mapa de navegação do painel. É um só para as duas formas de menu: a coluna
 * fixa do desktop e a barra de abas + folha "Mais" do celular. Quem cria uma
 * tela nova registra aqui e ela aparece nos dois lugares.
 */
export type SecaoApp =
  | "operations"
  | "clients"
  | "client-requests"
  | "leads"
  | "projects"
  | "overview"
  | "reconciliation"
  | "transactions"
  | "ledger"
  | "import"
  | "mercadopago"
  | "reports"
  | "seo"
  | "obs"
  | "meta"
  | "whatsapp"
  | "services"
  | "newsletter"
  | "jobs"
  | "partner-network"
  | "domains"
  | "google-suite"
  | "fiscal"
  | "credito"
  | "estudio"
  | "automacoes";

export type ItemNavegacao = {
  href: string;
  label: string;
  section: SecaoApp;
  /** Só o dono vê. Dinheiro, segredo e quem entra são dele. */
  somenteDono?: true;
};

export type GrupoNavegacao = { label: string; items: ItemNavegacao[]; somenteDono?: true };

/**
 * O menu que este papel enxerga.
 *
 * Esconder não é proteger — cada página e cada rota confere o papel por conta
 * própria. Isto existe para o menu não oferecer porta fechada: a equipe não
 * precisa ver um "Financeiro" que vai recusá-la.
 */
export function navegacaoDoPapel(role: string): GrupoNavegacao[] {
  // Só OWNER, de propósito: o sócio entra no painel mas não no caixa, então o
  // menu dele não mostra o que `ehDono()` vai recusar. A comparação é com a
  // string e não com `ehDono()` para este módulo continuar sem importar auth,
  // que puxa prisma e cookies e não roda no cliente.
  if (role === "OWNER") return navegacao;
  return navegacao
    .filter((grupo) => !grupo.somenteDono)
    .map((grupo) => ({ ...grupo, items: grupo.items.filter((item) => !item.somenteDono) }))
    .filter((grupo) => grupo.items.length > 0);
}

/** Abas do celular deste papel — mesma regra do menu. */
export function abasDoPapel(role: string): AbaCelular[] {
  return role === "OWNER" ? abasCelular : abasCelular.filter((aba) => !aba.somenteDono);
}

export const navegacao: GrupoNavegacao[] = [
  {
    label: "Operação",
    items: [
      { href: "/operacao", label: "Visão central", section: "operations" },
      { href: "/clientes", label: "Clientes", section: "clients" },
      {
        href: "/clientes/solicitacoes",
        label: "Solicitações",
        section: "client-requests",
        somenteDono: true,
      },
      { href: "/leads", label: "Leads", section: "leads" },
      { href: "/projetos", label: "Entregas", section: "projects" },
      { href: "/operacao/servicos", label: "Serviços", section: "services" },
    ],
  },
  {
    // Assunto da própria casa, não de cliente. Saíram de "Operação" em
    // 10/09/2026, quando "Leads" entrou e o grupo passou dos sete itens que a
    // coluna mostra sem rolar. Vaga e programa de parceiro não são a esteira
    // lead → cliente → entrega, então a separação também deixou o grupo mais
    // honesto do que estava.
    label: "Casa",
    items: [
      { href: "/vagas", label: "Vagas", section: "jobs" },
      {
        href: "/implantacao",
        label: "Implantação OpenAI",
        section: "partner-network",
      },
      {
        href: "/operacao/automacoes",
        label: "Automações",
        section: "automacoes",
        // Cofre do n8n: chave de terceiro é do dono.
        somenteDono: true,
      },
    ],
  },
  {
    // Onde o cliente é encontrado e falado com. Estava tudo dentro de
    // "Operação", que virou uma lista de 12 e obrigava a rolar.
    label: "Canais",
    items: [
      { href: "/operacao/seo", label: "SEO", section: "seo" },
      { href: "/operacao/dominios", label: "Domínios", section: "domains" },
      { href: "/operacao/google", label: "Google", section: "google-suite" },
      { href: "/operacao/meta", label: "Meta", section: "meta" },
      { href: "/operacao/whatsapp", label: "WhatsApp", section: "whatsapp" },
      {
        href: "/operacao/newsletter",
        label: "Newsletter",
        section: "newsletter",
      },
      { href: "/operacao/obs", label: "Observabilidade", section: "obs" },
    ],
  },
  {
    // O que a casa produz para as redes e o mural: o grupo "Canais" já está no
    // limite de sete itens, e conteúdo não é canal, é o que vai neles.
    label: "Conteúdo",
    items: [{ href: "/operacao/estudio", label: "Estúdio", section: "estudio" }],
  },
  {
    label: "Fiscal",
    somenteDono: true,
    items: [
      {
        href: "/operacao/fiscal",
        label: "Notas & SEFAZ",
        section: "fiscal",
        somenteDono: true,
      },
    ],
  },
  {
    label: "Financeiro",
    somenteDono: true,
    items: [
      { href: "/financeiro", label: "Visão geral", section: "overview" },
      {
        href: "/financeiro?status=PENDING",
        label: "Conciliação",
        section: "reconciliation",
      },
      {
        href: "/financeiro/contas",
        label: "Contas a pagar e receber",
        section: "ledger",
      },
      {
        href: "/financeiro?range=90",
        label: "Movimentações",
        section: "transactions",
      },
      {
        href: "/financeiro/importar",
        label: "Importar extrato",
        section: "import",
      },
      {
        href: "/financeiro/mercadopago",
        label: "Mercado Pago",
        section: "mercadopago",
      },
      { href: "/relatorios", label: "Relatórios", section: "reports" },
    ],
  },
  {
    // Score do CPF e do CNPJ junto com o que vence. Grupo próprio porque o
    // "Financeiro" já está nos sete itens que a coluna mostra sem rolar.
    label: "Crédito",
    somenteDono: true,
    items: [
      {
        href: "/financeiro/credito",
        label: "Score e contas a pagar",
        section: "credito",
        somenteDono: true,
      },
    ],
  },
];

/**
 * As abas do celular: os destinos de todo dia mais "Mais". Quatro abas dão
 * 94px cada num iPhone de 375px — rótulo legível e polegar sem mira; cinco
 * dão 75px, que ainda passa do mínimo de 44px da Apple.
 *
 * `secoes` diz quais seções acendem a aba — Financeiro acende em qualquer
 * tela do financeiro, não só na visão geral. Seção que não está em nenhuma
 * aba acende o "Mais", que é onde ela foi aberta.
 */
export type AbaCelular = {
  href: string;
  label: string;
  icone: "inicio" | "clientes" | "entregas" | "financeiro";
  secoes: SecaoApp[];
  somenteDono?: true;
};

export const abasCelular: AbaCelular[] = [
  { href: "/operacao", label: "Início", icone: "inicio", secoes: ["operations"] },
  {
    href: "/clientes",
    label: "Clientes",
    icone: "clientes",
    secoes: ["clients", "client-requests"],
  },
  {
    href: "/projetos",
    label: "Entregas",
    icone: "entregas",
    secoes: ["projects"],
  },
  {
    href: "/financeiro",
    label: "Financeiro",
    icone: "financeiro",
    somenteDono: true,
    secoes: [
      "overview",
      "reconciliation",
      "transactions",
      "ledger",
      "import",
      "mercadopago",
      "reports",
      "credito",
    ],
  },
];
