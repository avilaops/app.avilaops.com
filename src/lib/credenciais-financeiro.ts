/**
 * O catálogo das financeiras: quais chaves cada uma tem, o que cada uma decide
 * e qual código a lê.
 *
 * Existe para a tela não pedir "chave" e "valor" em branco. Digitar o nome da
 * variável à mão é como o parque chegou a ter `MERCADO_PAGO_ACCES_TOKEN_PROD`
 * (com o typo de origem) convivendo com `MP_ACCESS_TOKEN`: duas chaves, uma
 * conta, e ninguém sabendo qual valia.
 *
 * A honestidade do catálogo é a regra da casa aplicada a uma tela de
 * configuração: **nenhuma financeira ganha campo inventado**. Wise e Nubank
 * aparecem porque fazem parte do dinheiro da casa, e dizem na cara o que são
 * hoje — nenhuma linha de código lê chave delas.
 */

export type CampoCredencial = {
  /** O nome exato da variável, como o código lê. */
  chave: string;
  rotulo: string;
  /** O que esta chave decide. Aparece embaixo do campo. */
  ajuda: string;
  obrigatorio: boolean;
  /** Onde o valor é gerado, para quem está com o painel do provedor aberto. */
  ondeAchar?: string;
};

export type Financeira = {
  slug: string;
  nome: string;
  /** Uma linha sobre o papel dela no dinheiro da casa. */
  papel: string;
  /** Quando vazio, a ficha diz que a casa ainda não integra por API. */
  campos: CampoCredencial[];
  /** O que a tela precisa avisar antes de alguém preencher. */
  aviso?: string;
};

export const FINANCEIRAS: Financeira[] = [
  {
    slug: "mercado-pago",
    nome: "Mercado Pago",
    papel: "Recebe pelos serviços: mensalidade, implantação, entregável e cobrança avulsa.",
    aviso:
      "O token decide EM QUAL CONTA o dinheiro entra. Ele precisa ser o da conta do CNPJ — receita de pessoa jurídica recebida em conta de pessoa física não se comprova no CNPJ e não casa com nota fiscal.",
    campos: [
      {
        chave: "MP_ACCESS_TOKEN",
        rotulo: "Access Token de produção",
        ajuda: "Começa com APP_USR-. É com ele que toda cobrança é emitida.",
        obrigatorio: true,
        ondeAchar: "Painel de desenvolvedor → sua aplicação → Credenciais de produção",
      },
      {
        chave: "MP_WEBHOOK_SECRET",
        rotulo: "Assinatura secreta do webhook",
        ajuda:
          "Sem ela o webhook não processa nada: responde 503 e o Mercado Pago reenvia, então a baixa das faturas para e volta sozinha quando a chave entrar.",
        obrigatorio: true,
        ondeAchar: "Painel de desenvolvedor → sua aplicação → Webhooks → Assinatura secreta",
      },
      {
        chave: "MP_CLIENT_ID",
        rotulo: "Client ID da aplicação",
        ajuda:
          "Só diagnóstico: é por ele que a tela do Mercado Pago lê para onde a URL global de notificação está apontada.",
        obrigatorio: false,
        ondeAchar: "Painel de desenvolvedor → sua aplicação → Dados da aplicação",
      },
      {
        chave: "MP_WEBHOOK_TOKEN",
        rotulo: "Token na URL de notificação",
        ajuda:
          "Opcional, e é a primeira barreira do webhook, antes da assinatura. Quando preenchido, entra sozinho na notification_url de cada cobrança.",
        obrigatorio: false,
      },
      {
        chave: "MP_PUBLIC_KEY",
        rotulo: "Public Key",
        ajuda: "Só será usada quando o formulário de cartão existir. Pode ficar vazia.",
        obrigatorio: false,
        ondeAchar: "Painel de desenvolvedor → sua aplicação → Credenciais de produção",
      },
    ],
  },
  {
    slug: "efi",
    nome: "Efí",
    papel: "Gateway anterior. Nenhuma cobrança nova nasce aqui desde 31/08/2026.",
    aviso:
      "Mantido no ar só para as cobranças que já estavam abertas quando a casa migrou. Quando a última fechar, estas chaves podem ser aposentadas.",
    campos: [
      {
        chave: "EFI_CLIENT_ID_PRODUCAO",
        rotulo: "Client ID de produção",
        ajuda: "Identifica a aplicação na API da Efí.",
        obrigatorio: false,
      },
      {
        chave: "EFI_SECRET_KEY_PRODUCAO",
        rotulo: "Secret Key de produção",
        ajuda: "O par do Client ID. Juntos autenticam as consultas das cobranças abertas.",
        obrigatorio: false,
      },
      {
        chave: "EFI_CERTIFICATE_P12_BASE64",
        rotulo: "Certificado .p12 em base64",
        ajuda: "A Efí exige certificado na conexão. Guardado em base64 por ser binário.",
        obrigatorio: false,
      },
      {
        chave: "EFI_PIX_KEY",
        rotulo: "Chave Pix",
        ajuda: "Para onde o Pix da Efí era liquidado.",
        obrigatorio: false,
      },
    ],
  },
  {
    slug: "paypal",
    nome: "PayPal",
    papel: "Trilho de quem paga de fora do Brasil.",
    campos: [
      {
        chave: "PAYPAL_CLIENT_ID",
        rotulo: "Client ID",
        ajuda: "Da aplicação no painel de desenvolvedor do PayPal.",
        obrigatorio: true,
      },
      {
        chave: "PAYPAL_SECRET",
        rotulo: "Secret",
        ajuda: "O par do Client ID.",
        obrigatorio: true,
      },
      {
        chave: "PAYPAL_WEBHOOK_ID",
        rotulo: "ID do webhook",
        ajuda:
          "Sem ele o webhook RECUSA a notificação, de propósito: não se libera acesso pago confiando em cabeçalho não verificado.",
        obrigatorio: true,
      },
      {
        chave: "PAYPAL_AMBIENTE",
        rotulo: "Ambiente",
        ajuda: "sandbox ou producao. Sandbox e produção são mundos separados, com credenciais próprias.",
        obrigatorio: false,
      },
    ],
  },
  {
    slug: "wise",
    nome: "Wise",
    papel: "Conta em moeda estrangeira. Entra no extrato por importação de CSV.",
    aviso:
      "Nenhuma chave da Wise é lida pelo código hoje: o extrato dela chega pelo arquivo que você exporta e sobe em /financeiro/importar. Guardar um token aqui é possível, mas até existir integração ele fica parado no cofre.",
    campos: [],
  },
  {
    slug: "nubank",
    nome: "Nubank",
    papel: "Conta da casa. Ainda sem integração.",
    aviso:
      "O Nubank não publica API aberta para isso, e nenhuma linha do código lê chave dele. A ficha existe para o dia em que houver — e para guardar no cofre, cifrado, qualquer segredo que hoje estaria num bloco de notas.",
    campos: [],
  },
];

export function financeiraPorSlug(slug: string): Financeira | null {
  return FINANCEIRAS.find((f) => f.slug === slug) ?? null;
}

/** Todas as chaves que o catálogo conhece — serve para a lista mostrar o quanto já está preenchido. */
export function chavesDoFinanceiro(): string[] {
  return FINANCEIRAS.flatMap((f) => f.campos.map((c) => c.chave));
}

// ---------------------------------------------------------------------------
// Campos livres: banco que o código não lê, cadastrado à mão
// ---------------------------------------------------------------------------
//
// Nubank, Wise, Inter, um banco que entrar amanhã: nenhum código lê chave
// deles, e o catálogo continua sem inventar campo. Mas o dono precisa de um
// lugar cifrado para o que hoje estaria num bloco de notas — então a ficha
// aceita campos que ELE nomeia, e a tela diz na cara que nada lê aquilo.
//
// Só vale para instituição sem campo no catálogo. Campo livre no Mercado Pago
// seria exatamente o `MERCADO_PAGO_ACCES_TOKEN_PROD` de novo: um token
// guardado com capricho num nome que o código não lê.

export const PREFIXO_LIVRE = "BANCO_";

/** "Banco Inter S.A." → "banco-inter-s-a". É o endereço da ficha. */
export function slugDaInstituicao(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function trechoDeChave(texto: string, limite: number) {
  return slugDaInstituicao(texto).replace(/-/g, "_").toUpperCase().slice(0, limite);
}

/** ("Nubank", "Client ID") → "BANCO_NUBANK__CLIENT_ID". O `__` separa os dois nomes. */
export function chaveLivre(instituicao: string, rotulo: string): string {
  const banco = trechoDeChave(instituicao, 30);
  const campo = trechoDeChave(rotulo, 40);
  if (!banco) throw new Error("Informe o nome da instituição.");
  if (!campo) throw new Error("Informe o nome do campo.");
  return `${PREFIXO_LIVRE}${banco}__${campo}`;
}

/**
 * Pode receber campo livre? Instituição do catálogo COM campos, não: o código
 * lê aquelas chaves pelo nome, e campo à mão ali seria chave órfã.
 */
export function aceitaCampoLivre(nome: string): boolean {
  const slug = slugDaInstituicao(nome);
  const doCatalogo = FINANCEIRAS.find(
    (f) => f.slug === slug || slugDaInstituicao(f.nome) === slug,
  );
  return !doCatalogo || doCatalogo.campos.length === 0;
}

export type InstituicaoLivre = { slug: string; nome: string; total: number };

/** As instituições cadastradas à mão que NÃO estão no catálogo. */
export function instituicoesLivres(
  credenciais: ReadonlyArray<{ chave: string; grupo: string | null }>,
): InstituicaoLivre[] {
  const porSlug = new Map<string, InstituicaoLivre>();
  for (const credencial of credenciais) {
    if (!credencial.chave.startsWith(PREFIXO_LIVRE) || !credencial.grupo) continue;
    const slug = slugDaInstituicao(credencial.grupo);
    if (financeiraPorSlug(slug)) continue;
    const atual = porSlug.get(slug) ?? { slug, nome: credencial.grupo, total: 0 };
    atual.total += 1;
    porSlug.set(slug, atual);
  }
  return [...porSlug.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
