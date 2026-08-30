/**
 * Mapa de navegação do painel. É um só para as duas formas de menu: a coluna
 * fixa do desktop e a barra de abas + folha "Mais" do celular. Quem cria uma
 * tela nova registra aqui e ela aparece nos dois lugares.
 */
export type SecaoApp =
  | "operations"
  | "clients"
  | "client-requests"
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
  | "google-suite";

export type ItemNavegacao = { href: string; label: string; section: SecaoApp };

export type GrupoNavegacao = { label: string; items: ItemNavegacao[] };

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
      },
      { href: "/projetos", label: "Entregas", section: "projects" },
      { href: "/operacao/seo", label: "SEO", section: "seo" },
      { href: "/operacao/google", label: "Google", section: "google-suite" },
      { href: "/operacao/obs", label: "Observabilidade", section: "obs" },
      { href: "/operacao/meta", label: "Meta", section: "meta" },
      { href: "/operacao/whatsapp", label: "WhatsApp", section: "whatsapp" },
      { href: "/operacao/servicos", label: "Serviços", section: "services" },
      {
        href: "/operacao/newsletter",
        label: "Newsletter",
        section: "newsletter",
      },
      { href: "/vagas", label: "Vagas", section: "jobs" },
    ],
  },
  {
    label: "Financeiro",
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
    label: "Estratégia",
    items: [
      {
        href: "/implantacao",
        label: "Implantação OpenAI",
        section: "partner-network",
      },
    ],
  },
];

/**
 * As abas do celular: os três destinos de todo dia mais "Mais". Quatro abas
 * dão 94px cada num iPhone de 375px — rótulo legível e polegar sem mira.
 * Entregas (projetos) fica na folha: o dia a dia de prazo mora no Todoist.
 * `secoes` diz quais seções acendem a aba — Financeiro acende em qualquer
 * tela do financeiro, não só na visão geral.
 */
export type AbaCelular = {
  href: string;
  label: string;
  icone: "inicio" | "clientes" | "financeiro";
  secoes: SecaoApp[];
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
    href: "/financeiro",
    label: "Financeiro",
    icone: "financeiro",
    secoes: [
      "overview",
      "reconciliation",
      "transactions",
      "ledger",
      "import",
      "mercadopago",
      "reports",
    ],
  },
];
