/**
 * O que cada campo da ficha do cliente quer, e para onde o valor vai depois.
 *
 * Nasceu em 19/09/2026 de uma pergunta do Nícolas diante do campo "Provedor
 * atual": *"eu coloquei ??? porque eu não tenho ideia do que significa"*. Se o
 * dono do produto não sabe o que o campo pede, o campo está quebrado — e a
 * ficha tinha 76 deles, quase todos com rótulo de uma palavra e nenhuma
 * explicação em lugar nenhum: nem na tela, nem no schema, nem na documentação.
 *
 * Duas regras para quem for acrescentar campo aqui:
 *
 * 1. `oQueE` é **a pergunta que você faria em voz alta**, não o rótulo. "Onde
 *    o site dele está hospedado hoje?" ensina; "Provedor atual" não.
 * 2. `ondeVai` diz o **destino real, conferido no código**. Quando não há
 *    destino, o texto diz isso com todas as letras. Campo que não alimenta
 *    nada e finge que alimenta é pior que campo sem explicação: faz a pessoa
 *    caprichar num dado que ninguém lê.
 *
 * O `SEM_USO` não é rascunho à espera de texto melhor. Ele é o inventário do
 * que sobrou de formulários antigos, e é o que sustenta a decisão de cortar
 * esses campos. Enquanto não são cortados, quem preenche merece saber.
 */

export type CampoExplicado = {
  /** A pergunta, em português claro. */
  oQueE: string;
  /** Para onde o valor vai. `null` quando nada lê este campo hoje. */
  ondeVai: string | null;
};

/** Texto único para o campo que ninguém lê, para não inventar variação. */
const SEM_USO = null;

export const CAMPOS_EXPLICADOS: Readonly<Record<string, CampoExplicado>> = {
  // ---------------------------------------------------------------- empresa
  name: {
    oQueE: "O nome pelo qual a empresa é conhecida, o que está na fachada.",
    ondeVai: "É o título da ficha, o nome na lista de clientes e o que aparece em todo lugar que cita este cliente.",
  },
  legalName: {
    oQueE: "A razão social, o nome que está no cartão CNPJ.",
    ondeVai: "Sai no contrato, na nota fiscal e na cobrança. Sem ele a emissão de nota não fecha.",
  },
  segment: {
    oQueE: "Em que ramo a empresa atua: pet, barbearia, indústria.",
    ondeVai: "Agrupa a lista de clientes e a Visão central.",
  },
  status: {
    oQueE: "Em que estágio o cliente está com a gente.",
    ondeVai: "Decide se o cliente aparece como ativo nas listas e nos totais da operação.",
  },
  stateRegistration: {
    oQueE: "A inscrição estadual, quando a empresa tem.",
    ondeVai: "Exigida na emissão de nota em alguns regimes. A sincronização da SEFAZ também preenche este campo sozinha quando acha a informação numa nota recebida.",
  },
  municipalRegistration: {
    oQueE: "A inscrição municipal, quando a prefeitura exige.",
    ondeVai: SEM_USO,
  },
  companyDescription: {
    oQueE: "O que a empresa faz, em um parágrafo, como se explicasse para um estranho.",
    ondeVai: "É o texto que a IA usa de base para redigir site, anúncio e post. Quanto melhor aqui, menos retrabalho lá.",
  },
  servicesOffered: {
    oQueE: "Os serviços que a empresa vende.",
    ondeVai: "Entra no material que a IA redige e no que o site interno publica.",
  },
  productsOffered: {
    oQueE: "Os produtos que a empresa vende.",
    ondeVai: "Mesmo destino dos serviços: base para o texto do site e das peças.",
  },
  commercialDifferentials: {
    oQueE: "Por que alguém compra dele e não do concorrente.",
    ondeVai: "É o que a IA usa para o texto não ficar genérico.",
  },
  serviceArea: {
    oQueE: "Até onde a empresa atende: bairro, cidade, estado, país.",
    ondeVai: "Base para o texto de SEO local e para a escolha de palavra-chave por região.",
  },

  // ---------------------------------------------------------------- contato
  ownerName: {
    oQueE: "Quem manda no negócio, a pessoa com quem a operação fala no dia a dia.",
    ondeVai: "É o nome que aparece quando alguém precisa ligar, e o responsável registrado no projeto.",
  },
  ownerRole: {
    oQueE: "O cargo dessa pessoa: dono, gerente, sócio.",
    ondeVai: SEM_USO,
  },
  phone: {
    oQueE: "Telefone fixo ou principal de contato.",
    ondeVai: "Vai junto quando o cliente ganha acesso ao portal, à loja ou ao restaurante.",
  },
  whatsapp: {
    oQueE: "O número de WhatsApp que a empresa usa de verdade.",
    ondeVai: "É o canal de aviso de cobrança e suporte, e o número que o módulo de WhatsApp usa.",
  },
  email: {
    oQueE: "O e-mail para onde vai fatura e acesso ao portal.",
    ondeVai: "Destino da cobrança, da recuperação de senha e do convite de acesso.",
  },
  bestContactTime: {
    oQueE: "A que horas essa pessoa costuma atender.",
    ondeVai: SEM_USO,
  },
  contactNotes: {
    oQueE: "O que mais é bom saber antes de ligar.",
    ondeVai: SEM_USO,
  },

  // --------------------------------------------------------------- endereço
  postalCode: {
    oQueE: "O CEP. Preencher e tocar em “Preencher pelo CEP” traz o resto do endereço.",
    ondeVai: "Endereço de cobrança na emissão de boleto e de nota.",
  },
  street: { oQueE: "A rua ou avenida.", ondeVai: "Endereço de cobrança na emissão de boleto e de nota." },
  number: { oQueE: "O número do imóvel.", ondeVai: "Endereço de cobrança na emissão de boleto e de nota." },
  complement: { oQueE: "Sala, andar, bloco.", ondeVai: SEM_USO },
  district: { oQueE: "O bairro.", ondeVai: "Endereço de cobrança na emissão de boleto e de nota." },
  city: { oQueE: "A cidade.", ondeVai: "Endereço de cobrança, e base do SEO local." },
  state: { oQueE: "A sigla do estado.", ondeVai: "Endereço de cobrança na emissão de boleto e de nota." },
  country: { oQueE: "O país. Fica “Brasil” quando ninguém mexe.", ondeVai: "Endereço de cobrança e moeda da assinatura." },

  // ------------------------------------------------------------- site atual
  hasCurrentSite: {
    oQueE: "A empresa já tem site no ar hoje?",
    ondeVai: "Decide se o fluxo é migrar um site existente ou criar do zero.",
  },
  currentSiteUrl: {
    oQueE: "O endereço do site que ela tem hoje.",
    ondeVai: "É o site que a auditoria de SEO analisa e que o Search Console acompanha.",
  },
  siteProvider: {
    oQueE: "Onde esse site está hospedado hoje: Wix, Hostinger, GoDaddy, “o sobrinho fez”.",
    ondeVai: "Aparece no cadastro para quem vai migrar saber o que vai encontrar. Nenhuma automação lê.",
  },
  accessStatus: {
    oQueE: "A gente tem a senha do painel dele para migrar, ou vai ter que recriar do zero?",
    ondeVai: "Aparece no cadastro para quem vai migrar se planejar. Nenhuma automação lê.",
  },
  currentProvider: {
    oQueE: "Duplicata antiga de “Provedor atual”. Use o de cima.",
    ondeVai: SEM_USO,
  },

  // ---------------------------------------------------------------- domínio
  hasDomain: {
    oQueE: "A empresa já tem um domínio registrado no nome dela?",
    ondeVai: "Decide se o fluxo é transferir um domínio ou registrar um novo.",
  },
  desiredDomain: {
    oQueE: "Qual domínio ela quer, se ainda não tem.",
    ondeVai: "É o nome que o botão “Verificar domínio” consulta no Registro.br.",
  },
  preferredExtension: {
    oQueE: "A terminação preferida: .com.br, .com, .app.br.",
    ondeVai: "Entra na verificação de disponibilidade junto com o nome.",
  },
  domainAvailabilityStatus: {
    oQueE: "O resultado da última verificação. Preenchido pelo botão, não à mão.",
    ondeVai: "Trava o avanço do registro enquanto o domínio não estiver livre.",
  },
  selectedDomainPlanSlug: {
    oQueE: "Qual plano de domínio o cliente escolheu.",
    ondeVai: "Entra na cobrança: é o que define o valor da renovação anual.",
  },
  internalSubdomain: {
    oQueE: "O apelido do cliente dentro do nosso domínio, se ele for usar um site interno.",
    ondeVai: "Vira o endereço do site interno dele e é publicado de verdade.",
  },

  // ----------------------------------------------------------- redes sociais
  instagramHandle: {
    oQueE: "O @ do Instagram, sem o arroba.",
    ondeVai: "É o único perfil social que o assistente de cadastro conhece e usa no material.",
  },
  facebookPageName: { oQueE: "O nome da página no Facebook.", ondeVai: SEM_USO },
  facebookUrl: { oQueE: "O endereço da página no Facebook.", ondeVai: SEM_USO },
  instagramUrl: { oQueE: "O endereço do perfil no Instagram.", ondeVai: SEM_USO },
  linkedinUrl: { oQueE: "O endereço no LinkedIn.", ondeVai: SEM_USO },
  tiktokUrl: { oQueE: "O endereço no TikTok.", ondeVai: SEM_USO },
  youtubeUrl: { oQueE: "O endereço no YouTube.", ondeVai: SEM_USO },
  googleBusinessProfileUrl: {
    oQueE: "O link do Perfil da Empresa no Google, aquele que aparece no mapa.",
    ondeVai: "O assistente de cadastro sabe deste campo, mas o módulo do Google busca pela API e não lê daqui.",
  },
  otherSocialProfiles: { oQueE: "Qualquer outra rede que a empresa use.", ondeVai: SEM_USO },
  socialMediaOwnerStatus: { oQueE: "Quem administra as redes dele hoje.", ondeVai: SEM_USO },

  // ------------------------------------------------------------ oportunidade
  hasPdfCatalog: { oQueE: "A empresa tem catálogo em PDF para virar página?", ondeVai: SEM_USO },
  hasProfessionalEmail: { oQueE: "Ela já usa e-mail no domínio próprio?", ondeVai: SEM_USO },
  hasCompleteBrandIdentity: { oQueE: "Ela tem logo, cores e tipografia definidos?", ondeVai: SEM_USO },
  onlineStoreInterest: { oQueE: "Tem interesse em vender online?", ondeVai: SEM_USO },
  onlineStoreNotes: { oQueE: "O que ela falou sobre vender online.", ondeVai: SEM_USO },
  emailOpportunityStatus: { oQueE: "Em que pé está a conversa sobre e-mail profissional.", ondeVai: SEM_USO },
  brandOpportunityPlan: { oQueE: "O plano combinado para identidade visual.", ondeVai: SEM_USO },
  catalogOpportunityPlan: { oQueE: "O plano combinado para o catálogo.", ondeVai: SEM_USO },
  socialOpportunityPlan: { oQueE: "O plano combinado para redes sociais.", ondeVai: SEM_USO },
  onlineStoreOpportunityStatus: { oQueE: "Em que pé está a conversa sobre loja online.", ondeVai: SEM_USO },

  // -------------------------------------------------------------- integrações
  gtm: {
    oQueE: "O id do Google Tag Manager do cliente.",
    ondeVai: "É o que o TagFlow injeta no site dele.",
  },
  searchConsole: {
    oQueE: "Se a propriedade do Search Console já está ligada.",
    ondeVai: "Alimenta a tela de SEO com clique, impressão e posição reais.",
  },
  metaPixel: { oQueE: "O id do pixel da Meta.", ondeVai: SEM_USO },
  metaBusiness: { oQueE: "O id do Business Manager da Meta.", ondeVai: SEM_USO },
  googleAds: { oQueE: "O id da conta de anúncios do Google.", ondeVai: SEM_USO },
  whatsappBusiness: { oQueE: "O id da conta de WhatsApp Business.", ondeVai: SEM_USO },
  transactionalEmail: { oQueE: "O serviço de e-mail transacional em uso.", ondeVai: SEM_USO },

  // ---------------------------------------------------------- implantação
  onboardingStage: { oQueE: "Em que etapa da implantação o cliente está.", ondeVai: SEM_USO },
  internalOwnerName: { oQueE: "Quem da Ávila cuida deste cliente.", ondeVai: SEM_USO },
  nextAction: {
    oQueE: "A próxima coisa a fazer por este cliente.",
    ondeVai: "Entra na fila de atenção da Visão central.",
  },
  notes: { oQueE: "Qualquer coisa que não coube nos outros campos.", ondeVai: "Fica na ficha, para quem abrir depois." },

  // ------------------------------------------------------- palavra-chave SEO
  keyword: {
    oQueE: "A busca que você quer que traga este cliente no Google.",
    ondeVai: "Vira uma linha acompanhada na tela de SEO, com posição e evolução.",
  },
  locality: { oQueE: "A cidade ou região desta busca.", ondeVai: "Compõe a palavra-chave acompanhada." },
  intent: { oQueE: "O que a pessoa quer ao buscar isso: conhecer, comparar, comprar.", ondeVai: "Classifica a palavra-chave na tela de SEO." },
  estimatedVolume: { oQueE: "Quantas buscas por mês, na sua estimativa.", ondeVai: "Ordena as palavras-chave por tamanho da oportunidade." },
  recommendedPage: { oQueE: "Qual página do site deveria ganhar essa busca.", ondeVai: "Liga a palavra-chave à página, na tela de SEO." },
  priority: { oQueE: "O quanto essa palavra importa agora.", ondeVai: "Ordena a lista de palavras-chave." },
  siteUrl: {
    oQueE: "O endereço do site que a gente acompanha no Search Console.",
    ondeVai: "É a propriedade consultada para trazer clique, impressão e posição.",
  },
};

/** A explicação do campo, ou `null` quando ele ainda não foi documentado. */
export function explicarCampo(chave: string): CampoExplicado | null {
  return CAMPOS_EXPLICADOS[chave] ?? null;
}
