/**
 * Registro dos campos do cadastro do cliente que o assistente conhece.
 *
 * É a única lista da feature: a análise de lacunas, o preenchimento a partir
 * da Receita Federal, o schema que a IA recebe e a gravação final leem daqui.
 * Um campo que não está neste arquivo não é analisado, não é sugerido e não é
 * gravado — nem por engano, nem por uma resposta criativa do modelo.
 *
 * `origens` diz quem tem legitimidade para preencher aquele campo:
 *
 * - RECEITA_FEDERAL: o dado já veio da consulta de CNPJ guardada em
 *   `organizations.cnpj_data`. É fato, não palpite.
 * - SEFAZ: o dado é o bloco `<dest>` da NF-e mais recente recebida pelo
 *   cliente, guardado pela sincronização fiscal. Também é documento, mas vale
 *   menos que a Receita: quem escreveu foi um fornecedor, não o cliente nem o
 *   órgão — pode ser endereço de entrega, pode estar desatualizado. Por isso
 *   entra sempre DEPOIS da Receita na ordem das origens.
 * - IA: campo descritivo, em que redigir bem é o trabalho e não existe
 *   resposta "certa" a ser consultada em lugar nenhum.
 * - CLIENTE: só a pessoa do outro lado sabe. Aparece na lista do que falta
 *   para ser perguntado, e nenhuma automação tenta adivinhar.
 *
 * Documento, telefone, e-mail, inscrição estadual e CPF do responsável nunca
 * têm IA entre as origens: um número plausível inventado por um modelo é pior
 * do que um campo vazio, porque parece preenchido.
 */

export type OrigemCampo = "RECEITA_FEDERAL" | "SEFAZ" | "IA" | "CLIENTE";

export type DestinoCampo = "organization" | "profile" | "webPresence";

export type CampoCadastro = {
  /** Chave estável usada na API, no banco e no schema da IA. */
  chave: string;
  rotulo: string;
  grupo: string;
  destino: DestinoCampo;
  /** Propriedade correspondente no modelo Prisma de destino. */
  coluna: string;
  tamanhoMaximo: number;
  origens: OrigemCampo[];
  /** Texto longo: muda só a apresentação na revisão. */
  multilinha?: boolean;
  /** Por que o campo importa — mostrado na lista do que falta. */
  porque?: string;
};

export const CAMPOS_CADASTRO: readonly CampoCadastro[] = [
  {
    chave: "legalName",
    rotulo: "Razão social",
    grupo: "Identificação",
    destino: "organization",
    coluna: "legalName",
    tamanhoMaximo: 160,
    origens: ["RECEITA_FEDERAL", "SEFAZ", "CLIENTE"],
    porque: "Sai em contrato, nota fiscal e cobrança.",
  },
  {
    chave: "segment",
    rotulo: "Segmento",
    grupo: "Identificação",
    destino: "organization",
    coluna: "segment",
    tamanhoMaximo: 80,
    origens: ["RECEITA_FEDERAL", "IA", "CLIENTE"],
    porque: "Orienta a proposta comercial e o conteúdo de SEO.",
  },
  {
    chave: "stateRegistration",
    rotulo: "Inscrição estadual",
    grupo: "Identificação",
    destino: "profile",
    coluna: "stateRegistration",
    tamanhoMaximo: 80,
    origens: ["SEFAZ", "CLIENTE"],
    porque: "Exigida na emissão de nota para alguns regimes.",
  },
  {
    chave: "ownerName",
    rotulo: "Nome do responsável",
    grupo: "Contato",
    destino: "profile",
    coluna: "ownerName",
    tamanhoMaximo: 160,
    origens: ["CLIENTE"],
    porque: "É com quem a operação fala no dia a dia.",
  },
  {
    chave: "phone",
    rotulo: "Telefone",
    grupo: "Contato",
    destino: "profile",
    coluna: "phone",
    tamanhoMaximo: 60,
    origens: ["RECEITA_FEDERAL", "SEFAZ", "CLIENTE"],
    porque: "Canal de contato registrado do cliente.",
  },
  {
    chave: "whatsapp",
    rotulo: "WhatsApp",
    grupo: "Contato",
    destino: "profile",
    coluna: "whatsapp",
    tamanhoMaximo: 60,
    origens: ["CLIENTE"],
    porque: "Canal usado para aviso de cobrança e suporte.",
  },
  {
    chave: "email",
    rotulo: "E-mail",
    grupo: "Contato",
    destino: "profile",
    coluna: "email",
    tamanhoMaximo: 160,
    origens: ["RECEITA_FEDERAL", "SEFAZ", "CLIENTE"],
    porque: "Destino da fatura e do acesso ao portal.",
  },
  {
    chave: "responsibleCpf",
    rotulo: "CPF do responsável",
    grupo: "Contato",
    destino: "profile",
    coluna: "responsibleCpf",
    tamanhoMaximo: 20,
    origens: ["CLIENTE"],
    porque: "Sem ele, boleto e cartão ficam indisponíveis na Efí.",
  },
  {
    chave: "postalCode",
    rotulo: "CEP",
    grupo: "Endereço",
    destino: "profile",
    coluna: "postalCode",
    tamanhoMaximo: 20,
    origens: ["RECEITA_FEDERAL", "SEFAZ", "CLIENTE"],
  },
  {
    chave: "street",
    rotulo: "Logradouro",
    grupo: "Endereço",
    destino: "profile",
    coluna: "street",
    tamanhoMaximo: 180,
    origens: ["RECEITA_FEDERAL", "SEFAZ", "CLIENTE"],
  },
  {
    chave: "number",
    rotulo: "Número",
    grupo: "Endereço",
    destino: "profile",
    coluna: "number",
    tamanhoMaximo: 40,
    origens: ["RECEITA_FEDERAL", "SEFAZ", "CLIENTE"],
  },
  {
    chave: "district",
    rotulo: "Bairro",
    grupo: "Endereço",
    destino: "profile",
    coluna: "district",
    tamanhoMaximo: 120,
    origens: ["RECEITA_FEDERAL", "SEFAZ", "CLIENTE"],
  },
  {
    chave: "city",
    rotulo: "Cidade",
    grupo: "Endereço",
    destino: "profile",
    coluna: "city",
    tamanhoMaximo: 120,
    origens: ["RECEITA_FEDERAL", "SEFAZ", "CLIENTE"],
  },
  {
    chave: "state",
    rotulo: "UF",
    grupo: "Endereço",
    destino: "profile",
    coluna: "state",
    tamanhoMaximo: 60,
    origens: ["RECEITA_FEDERAL", "SEFAZ", "CLIENTE"],
  },
  {
    chave: "companyDescription",
    rotulo: "Descrição da empresa",
    grupo: "Perfil comercial",
    destino: "profile",
    coluna: "companyDescription",
    tamanhoMaximo: 2000,
    origens: ["IA", "CLIENTE"],
    multilinha: true,
    porque: "Base do texto do site, da bio das redes e da proposta.",
  },
  {
    chave: "servicesOffered",
    rotulo: "Serviços oferecidos",
    grupo: "Perfil comercial",
    destino: "profile",
    coluna: "servicesOffered",
    tamanhoMaximo: 2000,
    origens: ["IA", "CLIENTE"],
    multilinha: true,
    porque: "Define as páginas e as palavras-chave do site.",
  },
  {
    chave: "productsOffered",
    rotulo: "Produtos oferecidos",
    grupo: "Perfil comercial",
    destino: "profile",
    coluna: "productsOffered",
    tamanhoMaximo: 2000,
    origens: ["IA", "CLIENTE"],
    multilinha: true,
  },
  {
    chave: "commercialDifferentials",
    rotulo: "Diferenciais comerciais",
    grupo: "Perfil comercial",
    destino: "profile",
    coluna: "commercialDifferentials",
    tamanhoMaximo: 1200,
    origens: ["IA", "CLIENTE"],
    multilinha: true,
  },
  {
    chave: "serviceArea",
    rotulo: "Área de atendimento",
    grupo: "Perfil comercial",
    destino: "profile",
    coluna: "serviceArea",
    tamanhoMaximo: 1200,
    origens: ["IA", "CLIENTE"],
    multilinha: true,
    porque: "Define o alcance geográfico do SEO local.",
  },
  {
    chave: "currentSiteUrl",
    rotulo: "Site atual",
    grupo: "Presença digital",
    destino: "webPresence",
    coluna: "currentSiteUrl",
    tamanhoMaximo: 300,
    origens: ["CLIENTE"],
  },
  {
    chave: "instagramHandle",
    rotulo: "Instagram",
    grupo: "Presença digital",
    destino: "webPresence",
    coluna: "instagramHandle",
    tamanhoMaximo: 120,
    origens: ["CLIENTE"],
  },
  {
    chave: "googleBusinessProfileUrl",
    rotulo: "Perfil da Empresa no Google",
    grupo: "Presença digital",
    destino: "webPresence",
    coluna: "googleBusinessProfileUrl",
    tamanhoMaximo: 300,
    origens: ["CLIENTE"],
    porque: "Primeiro resultado da busca local do cliente.",
  },
];

const PORCHAVE = new Map(CAMPOS_CADASTRO.map((campo) => [campo.chave, campo]));

export function campoPorChave(chave: string): CampoCadastro | undefined {
  return PORCHAVE.get(chave);
}

/** Campos que a IA tem permissão de propor — nada fora desta lista é aceito. */
export const CAMPOS_DA_IA: readonly CampoCadastro[] = CAMPOS_CADASTRO.filter((campo) =>
  campo.origens.includes("IA"),
);

export function campoAceitaOrigem(chave: string, origem: OrigemCampo): boolean {
  return campoPorChave(chave)?.origens.includes(origem) ?? false;
}

/**
 * Corta um valor no tamanho da coluna sem partir palavra.
 *
 * A descrição de CNAE da Receita passa de 100 caracteres e o `segment` tem
 * 80: um `slice` cru grava "...com predominância de produção pr" na ficha do
 * cliente — texto mutilado que parece defeito do sistema, porque é. Quando o
 * corte cai no meio de uma palavra, recua até o último espaço; se não houver
 * espaço nenhum onde recuar (uma palavra só, maior que a coluna), corta no
 * limite mesmo, que é o único jeito de caber.
 */
export function cortarNoTamanho(valor: string, tamanhoMaximo: number): string {
  const texto = valor.trim();
  if (texto.length <= tamanhoMaximo) return texto;

  const cortado = texto.slice(0, tamanhoMaximo);
  const ultimoEspaco = cortado.lastIndexOf(" ");
  // Recuar até antes de metade da coluna jogaria fora informação demais; aí é
  // melhor o corte seco do que uma frase sem conteúdo.
  if (ultimoEspaco < tamanhoMaximo / 2) return cortado.trimEnd();

  return cortado.slice(0, ultimoEspaco).trimEnd().replace(/[,;:.]$/, "");
}
