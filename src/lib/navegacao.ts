import type { NomeIcone } from "@/components/ui/Icones";
import { canaisHubSocial } from "@/lib/hub-social";

/**
 * Mapa de navegação do painel. É um só para as duas formas de menu: a coluna
 * fixa do desktop e a barra de abas + folha "Mais" do celular. Quem cria uma
 * tela nova registra aqui e ela aparece nos dois lugares.
 */
export type SecaoApp =
  /** Telas de menu (/mais e /mais/<grupo>): nenhum item da lista acende. */
  | "menu"
  | "operations"
  | "clients"
  | "client-requests"
  | "lojas"
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
  | "health-live"
  | "credenciais"
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
  | "telas"
  | "estudio"
  | "icones"
  | "automacoes";

export type ItemNavegacao = {
  href: string;
  label: string;
  section: SecaoApp;
  /** Ícone do item nas telas de menu. Sem ícone, a linha mostra só o rótulo. */
  icone?: NomeIcone;
  /** Uma linha explicando o destino, no padrão das telas de ajustes do iPhone. */
  descricao?: string;
  /** Só o dono vê. Dinheiro, segredo e quem entra são dele. */
  somenteDono?: true;
};

export type GrupoNavegacao = {
  label: string;
  items: ItemNavegacao[];
  somenteDono?: true;
  /** Usado na URL da tela do grupo: /mais/<slug>. */
  slug?: string;
  icone?: NomeIcone;
  descricao?: string;
  /** Em que bloco da tela "Mais" o grupo aparece. */
  bloco?: "operacao" | "gestao" | "conta";
};

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

const ICONE_DO_CANAL: Partial<Record<SecaoApp, NomeIcone>> = {
  seo: "seo",
  domains: "dominios",
  "google-suite": "google",
  meta: "meta",
  whatsapp: "whatsapp",
  newsletter: "newsletter",
  estudio: "estudio",
  icones: "icones",
};

const DESCRICAO_DO_CANAL: Partial<Record<SecaoApp, string>> = {
  seo: "Posicionamento e saúde de busca",
  domains: "Registro, DNS e renovação",
  "google-suite": "Perfil de empresa e GA4",
  meta: "Facebook, Instagram e Lead Ads",
  whatsapp: "Webhooks, flows e eventos",
  newsletter: "Contatos, campanhas e envios",
  estudio: "Peças de vídeo e imagem",
  icones: "Favicon, atalho e manifesto",
};

export const navegacao: GrupoNavegacao[] = [
  {
    label: "Operação",
    slug: "operacao",
    icone: "operacao",
    descricao: "Clientes, projetos e o que a casa vende",
    bloco: "operacao",
    items: [
      { href: "/operacao", label: "Visão central", section: "operations", icone: "inicio", descricao: "O dia da operação num lugar só" },
      { href: "/clientes", label: "Clientes", section: "clients", icone: "clientes", descricao: "Fichas, contratos e serviços de cada cliente" },
      {
        href: "/clientes/solicitacoes",
        label: "Solicitações",
        section: "client-requests",
        icone: "fiscal",
        descricao: "Pedidos de cadastro esperando resposta",
        somenteDono: true,
      },
      { href: "/leads", label: "Leads", section: "leads", icone: "hub", descricao: "Quem chegou e ainda não é cliente" },
      { href: "/projetos", label: "Projetos", section: "projects", icone: "entregas", descricao: "Projetos por cliente, com prazo, link e mídia" },
      {
        // Mora em Operação e não em Casa: a loja é do cliente, não da casa —
        // o vizinho certo é "Clientes". Com ela o grupo fecha nos sete itens
        // que a coluna mostra sem rolar.
        href: "/lojas",
        label: "Lojas",
        section: "lojas",
        icone: "lojas",
        descricao: "Vitrines e catálogos dos clientes na plataforma",
      },
      { href: "/operacao/servicos", label: "Serviços", section: "services", icone: "config", descricao: "Catálogo de planos e preços" },
    ],
  },
  {
    // Assunto da própria casa, não de cliente. Saíram de "Operação" em
    // 10/09/2026, quando "Leads" entrou e o grupo passou dos sete itens que a
    // coluna mostra sem rolar. Vaga e programa de parceiro não são a esteira
    // lead → cliente → entrega, então a separação também deixou o grupo mais
    // honesto do que estava.
    label: "Casa",
    slug: "casa",
    icone: "casa",
    descricao: "Assuntos da própria Ávila Ops",
    bloco: "operacao",
    items: [
      { href: "/vagas", label: "Vagas", section: "jobs", icone: "vagas", descricao: "Anúncios e candidaturas" },
      {
        href: "/implantacao",
        label: "Implantação OpenAI",
        section: "partner-network",
        icone: "automacoes",
        descricao: "Pilares, roadmap e evidências do programa",
      },
      {
        href: "/operacao/automacoes",
        label: "Automações",
        section: "automacoes",
        icone: "automacoes",
        descricao: "Fluxos, execuções e credenciais do n8n",
        // Cofre do n8n: chave de terceiro é do dono.
        somenteDono: true,
      },
    ],
  },
  {
    // Onde o cliente é encontrado e falado com, mais o Estúdio que produz o que
    // vai nesses canais. Eram "Canais" (6) e "Conteúdo" (Estúdio), separados em
    // 10/09/2026 pelo teto de sete itens; em 16/09/2026 viraram uma área própria
    // fora de Operação, /hub-social. O teto subiu para oito em 18/09/2026, quando
    // Ícones entrou: ele nasceu de um limite de rolagem, não de uma regra do
    // produto, e oito ainda cabem na coluna do desktop e na tela "Mais" sem
    // rolar. A ordem é a das abas da área (src/lib/hub-social.ts é a fonte).
    label: "Hub Social",
    slug: "hub-social",
    icone: "hub",
    descricao: "Marketing e presença digital",
    bloco: "operacao",
    items: canaisHubSocial.map(({ href, label, section }) => ({
      href,
      label,
      section,
      icone: ICONE_DO_CANAL[section] ?? "hub",
      descricao: DESCRICAO_DO_CANAL[section],
    })),
  },
  {
    label: "Infraestrutura",
    slug: "infraestrutura",
    icone: "infra",
    descricao: "Servidores, serviços e observabilidade",
    bloco: "gestao",
    items: [
      { href: "/operacao/saude", label: "Saúde em tempo real", section: "health-live", icone: "saude", descricao: "Disponibilidade e capacidade, medidas agora" },
      { href: "/operacao/obs", label: "Observabilidade", section: "obs", icone: "operacao", descricao: "Métricas e sinais dos sistemas" },
      { href: "/operacao/telas", label: "Telas (Ávila TV)", section: "telas", icone: "telas", descricao: "Quem está no ar, quem caiu e quem espera um nome" },
      {
        href: "/operacao/credenciais",
        label: "Cofre de credenciais",
        section: "credenciais",
        icone: "config",
        descricao: "Segredos da plataforma, cifrados no banco",
        somenteDono: true,
      },
    ],
  },
  {
    label: "Fiscal",
    slug: "fiscal",
    icone: "fiscal",
    descricao: "Notas e obrigações",
    bloco: "gestao",
    somenteDono: true,
    items: [
      {
        href: "/operacao/fiscal",
        label: "Notas & SEFAZ",
        section: "fiscal",
        icone: "fiscal",
        descricao: "Emissão, consulta e situação na SEFAZ",
        somenteDono: true,
      },
    ],
  },
  {
    label: "Financeiro",
    slug: "financeiro",
    icone: "financeiro",
    descricao: "Cobranças, pagamentos e relatórios",
    bloco: "gestao",
    somenteDono: true,
    items: [
      { href: "/financeiro", label: "Visão geral", section: "overview", icone: "financeiro", descricao: "Saldo, recebimentos e pendências" },
      {
        href: "/financeiro?status=PENDING",
        label: "Conciliação",
        section: "reconciliation",
        icone: "fiscal",
        descricao: "Lançamentos esperando conferência",
      },
      {
        href: "/financeiro/contas",
        label: "Contas a pagar e receber",
        section: "ledger",
        icone: "credito",
        descricao: "O que vence e o que entra",
      },
      {
        href: "/financeiro?range=90",
        label: "Movimentações",
        section: "transactions",
        icone: "operacao",
        descricao: "Extrato dos últimos 90 dias",
      },
      {
        href: "/financeiro/importar",
        label: "Importar extrato",
        section: "import",
        icone: "adicionar",
        descricao: "Subir OFX ou CSV do banco",
      },
      {
        href: "/financeiro/mercadopago",
        label: "Mercado Pago",
        section: "mercadopago",
        icone: "financeiro",
        descricao: "Cobranças e extrato da conta CNPJ",
      },
      { href: "/relatorios", label: "Relatórios", section: "reports", icone: "operacao", descricao: "Fechamentos e exportações" },
    ],
  },
  {
    // Score do CPF e do CNPJ junto com o que vence. Grupo próprio porque o
    // "Financeiro" já está nos sete itens que a coluna mostra sem rolar.
    label: "Crédito",
    slug: "credito",
    icone: "credito",
    descricao: "Score e limites",
    bloco: "gestao",
    somenteDono: true,
    items: [
      {
        href: "/financeiro/credito",
        label: "Score e contas a pagar",
        section: "credito",
        icone: "credito",
        descricao: "Situação de crédito do CPF e do CNPJ",
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
    label: "Projetos",
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

/**
 * Qual grupo do menu já nasce aberto na folha "Mais" do celular.
 *
 * A folha tem 27 itens em 7 grupos: numa lista plana são quase três telas de
 * rolagem até o último. Com os grupos dobrados o menu inteiro cabe numa tela,
 * e a pergunta passa a ser qual abrir sozinho.
 *
 * A regra olha para a barra de abas, não para o grupo em si:
 *
 * - Tela SEM aba própria (SEO, Vagas, Fiscal…): abre o grupo onde ela mora.
 *   Você está ali e quase sempre quer o vizinho — o Meta depois do SEO.
 * - Tela COM aba própria (Início, Clientes, Entregas, Financeiro): não abre
 *   nada. Quem tem aba chega nela por um toque no rodapé; abrir "Mais" é
 *   justamente o gesto de ir para onde as abas não alcançam.
 *
 * Devolve o rótulo do grupo, que é a chave usada na tela, ou null para
 * "nenhum aberto". É função pura de propósito: a decisão dá para testar sem
 * montar componente.
 */
export function grupoInicialAberto(
  grupos: GrupoNavegacao[],
  section: SecaoApp,
  temAbaPropria: boolean,
): string | null {
  if (temAbaPropria) return null;

  const grupo = grupos.find((candidato) =>
    candidato.items.some((item) => item.section === section),
  );

  return grupo?.label ?? null;
}

/** Se esta seção acende alguma aba do rodapé — o outro lado de `maisAtivo`. */
export function secaoTemAba(abas: AbaCelular[], section: SecaoApp): boolean {
  return abas.some((aba) => aba.secoes.includes(section));
}

/** Grupo pela fatia da URL (/mais/<slug>), já filtrado pelo papel. */
export function grupoPorSlug(role: string, slug: string): GrupoNavegacao | null {
  return navegacaoDoPapel(role).find((grupo) => grupo.slug === slug) ?? null;
}

/** Grupos de um bloco da tela "Mais", na ordem em que aparecem. */
export function blocosDoMenu(role: string): { titulo: string; grupos: GrupoNavegacao[] }[] {
  const grupos = navegacaoDoPapel(role);
  const de = (bloco: GrupoNavegacao["bloco"]) => grupos.filter((grupo) => (grupo.bloco ?? "operacao") === bloco);
  return [
    { titulo: "Operação", grupos: de("operacao") },
    { titulo: "Gestão", grupos: de("gestao") },
  ].filter((bloco) => bloco.grupos.length > 0);
}

/**
 * Cor do ícone do grupo. As três cores da marca aparecem em pequenas doses:
 * azul para operação e infraestrutura, amarelo para o que faz crescer, e
 * vermelho para o que fala com o cliente. O resto fica neutro.
 */
export function tomDoGrupo(slug?: string): "azul" | "vermelho" | "amarelo" | "neutro" {
  switch (slug) {
    case "hub-social":
      return "amarelo";
    case "casa":
      return "vermelho";
    case "credito":
      return "amarelo";
    case "fiscal":
      return "neutro";
    default:
      return "azul";
  }
}

/**
 * De onde a tela veio e com que cara ela se apresenta, a partir da seção.
 *
 * Existe porque cada página repetia a mesma decisão à mão — qual ícone, qual
 * cor, para onde volta o botão do celular — e repetição de decisão é onde a
 * coerência vaza: em 19/09/2026 havia h1 de 22px numa tela e 28px na vizinha,
 * e metade das telas antigas não tinha caminho de volta no celular.
 *
 * A resposta já estava aqui: o mapa sabe em que grupo cada seção mora, e o
 * grupo tem ícone, cor e slug. `CabecalhoTela` só precisa receber.
 */
export function contextoDaSecao(section: SecaoApp): {
  icone: NomeIcone;
  tom: ReturnType<typeof tomDoGrupo>;
  voltar?: { href: string; rotulo: string };
} {
  for (const grupo of navegacao) {
    const item = grupo.items.find((i) => i.section === section);
    if (!item) continue;
    return {
      icone: item.icone ?? grupo.icone ?? "operacao",
      tom: tomDoGrupo(grupo.slug),
      voltar: grupo.slug ? { href: `/mais/${grupo.slug}`, rotulo: `Voltar para ${grupo.label}` } : undefined,
    };
  }
  // Seção que não está no menu (uma subtela, por exemplo) fica sem volta: o
  // chute seria pior que a ausência, porque levaria para o lugar errado.
  return { icone: "operacao", tom: "azul" };
}
