import { z } from "zod";
import { AiCoreStructuredClient } from "@avila-ops/ai-core";
import type { TenantContext } from "@avila-ops/ai-core";
import { PrismaKeyProvider } from "@/lib/ai-core/key-provider";
import { PrismaSpendGuard } from "@/lib/ai-core/spend-guard";
import { PrismaTelemetrySink } from "@/lib/ai-core/telemetry-sink";
import { CAMPOS_DA_IA, campoPorChave, type OrigemCampo } from "./campos";
import { valorAtual, type RetratoCadastro } from "./lacunas";

export const MODELO_PADRAO = "gpt-4o-mini";
export const PROJETO_AI_CORE = "cadastro-assistido";
export const AGENTE_AI_CORE = "cadastro-assistido-v1";

/** Teto de sugestões aceitas por rodada — revisão humana precisa caber numa tela. */
export const MAXIMO_SUGESTOES = 8;

/** Tamanho mínimo para um texto descritivo valer a revisão de alguém. */
const MINIMO_CARACTERES = 12;

export type ConfiancaSugestao = "ALTA" | "MEDIA" | "BAIXA";

export type SugestaoProposta = {
  campo: string;
  valor: string;
  origem: OrigemCampo;
  confianca: ConfiancaSugestao;
  justificativa: string;
};

const CHAVES_DA_IA = CAMPOS_DA_IA.map((campo) => campo.chave);

/**
 * Saída estruturada exigida do modelo. O `campo` é um enum fechado com as
 * chaves que a IA tem permissão de propor: o modelo não consegue nomear um
 * campo de documento, de telefone ou inexistente nem que tente.
 */
export const SCHEMA_SUGESTOES = z.object({
  sugestoes: z.array(
    z.object({
      campo: z.enum(CHAVES_DA_IA as [string, ...string[]]),
      valor: z.string(),
      confianca: z.enum(["ALTA", "MEDIA", "BAIXA"]),
      justificativa: z.string(),
    }),
  ),
  /** O que o modelo não conseguiu deduzir — vira pauta com o cliente. */
  observacao: z.string(),
});

export type SugestoesDaIa = z.infer<typeof SCHEMA_SUGESTOES>;

/**
 * O `$schema` na raiz é do zod, não do formato que a API de saída
 * estruturada aceita; sai antes de subir.
 */
export function jsonSchemaDasSugestoes(): Record<string, unknown> {
  const gerado = z.toJSONSchema(SCHEMA_SUGESTOES, { target: "draft-2020-12" }) as Record<
    string,
    unknown
  >;
  delete gerado.$schema;
  return gerado;
}

export const INSTRUCOES = [
  "Você preenche fichas cadastrais de clientes de uma agência brasileira de operação digital.",
  "Escreva em português do Brasil, em terceira pessoa, num tom sóbrio e comercial — sem adjetivos de propaganda e sem promessa de resultado.",
  "REGRA INEGOCIÁVEL: nunca invente dado verificável. Telefone, e-mail, CNPJ, CPF, endereço, CEP, preço, nome de pessoa, quantidade de clientes, ano de fundação e prêmio só entram se estiverem literalmente no contexto recebido.",
  "Proponha apenas campos para os quais o contexto dá base real. É correto devolver a lista vazia; é errado preencher por preencher.",
  "Use confianca=ALTA só quando o contexto sustenta o texto quase por inteiro, MEDIA quando é uma leitura razoável da atividade econômica e BAIXA quando é generalização do segmento.",
  "Na justificativa, diga em uma frase de qual informação do contexto você partiu.",
  "Em observacao, liste o que faltou no contexto e precisa ser perguntado ao cliente.",
].join(" ");

/**
 * Contexto factual mandado ao modelo. Entra só o que descreve a atividade da
 * empresa; documento, CPF do responsável, telefone, e-mail e endereço ficam
 * de fora de propósito — não ajudam a redigir texto comercial e não há razão
 * para trafegar dado pessoal que o trabalho não usa.
 */
export function montarContexto(retrato: RetratoCadastro): string {
  const org = retrato.organization;
  const cnpj =
    org.cnpjData && typeof org.cnpjData === "object" && !Array.isArray(org.cnpjData)
      ? (org.cnpjData as Record<string, unknown>)
      : {};

  const linhas: Array<[string, unknown]> = [
    ["Nome fantasia", org.name],
    ["Razão social", org.legalName],
    ["Segmento registrado", org.segment],
    ["Site", org.siteUrl],
    ["Atividade principal (CNAE)", cnpj.cnae_fiscal_descricao],
    ["Situação cadastral", cnpj.descricao_situacao_cadastral],
    ["Município", cnpj.municipio],
    ["UF", cnpj.uf],
    ["Porte", cnpj.porte],
    ["Natureza jurídica", cnpj.natureza_juridica],
    ["Descrição já cadastrada", retrato.profile?.companyDescription],
    ["Serviços já cadastrados", retrato.profile?.servicesOffered],
    ["Produtos já cadastrados", retrato.profile?.productsOffered],
    ["Diferenciais já cadastrados", retrato.profile?.commercialDifferentials],
    ["Área de atendimento já cadastrada", retrato.profile?.serviceArea],
    ["Site atual", retrato.webPresence?.currentSiteUrl],
    ["Instagram", retrato.webPresence?.instagramHandle],
  ];

  const contexto = linhas
    .filter(([, valor]) => typeof valor === "string" && valor.trim().length > 0)
    .map(([rotulo, valor]) => `${rotulo}: ${(valor as string).trim()}`)
    .join("\n");

  const pendentes = CAMPOS_DA_IA.filter((campo) => !valorAtual(retrato, campo))
    .map((campo) => `- ${campo.chave} (${campo.rotulo}, até ${campo.tamanhoMaximo} caracteres)`)
    .join("\n");

  return [
    "CONTEXTO DO CLIENTE (tudo que o sistema sabe e que é relevante para o texto):",
    contexto || "(nenhuma informação descritiva cadastrada)",
    "",
    "CAMPOS VAZIOS QUE VOCÊ PODE PROPOR:",
    pendentes || "(nenhum — devolva a lista vazia)",
  ].join("\n");
}

/**
 * Sequência longa de dígitos em campo descritivo é quase sempre um dado
 * verificável inventado (telefone, CNPJ, CEP). Os separadores caem antes da
 * medida porque "01310-100" e "(11) 98888-7777" só parecem curtos por causa
 * deles; o espaço fica, para não emendar dois números legítimos numa corrida
 * falsa ("fundada em 2010 2020").
 */
export function pareceDadoVerificavel(valor: string): boolean {
  return /\d{8,}/.test(valor.replace(/[.\-/()]/g, ""));
}

/**
 * Última barreira entre a resposta do modelo e o banco. Nada aqui confia no
 * que veio: campo fora do registro, campo que já tem valor, texto vazio,
 * repetido ou com cara de número inventado não passa. O enum do schema já
 * deveria impedir parte disso — esta função existe porque "deveria" não é
 * garantia quando a origem é um modelo de linguagem.
 */
export function filtrarSugestoes(
  brutas: Array<{ campo: string; valor: string; confianca: string; justificativa: string }>,
  retrato: RetratoCadastro,
  origem: OrigemCampo = "IA",
): SugestaoProposta[] {
  const aceitas: SugestaoProposta[] = [];
  const jaVistos = new Set<string>();

  for (const bruta of brutas) {
    if (aceitas.length >= MAXIMO_SUGESTOES) break;

    const campo = campoPorChave(bruta.campo);
    if (!campo) continue;
    if (!campo.origens.includes(origem)) continue;
    if (jaVistos.has(campo.chave)) continue;
    if (valorAtual(retrato, campo)) continue;

    const valor = typeof bruta.valor === "string" ? bruta.valor.trim() : "";
    if (valor.length < MINIMO_CARACTERES) continue;
    if (pareceDadoVerificavel(valor)) continue;

    const confianca: ConfiancaSugestao =
      bruta.confianca === "ALTA" || bruta.confianca === "BAIXA" ? bruta.confianca : "MEDIA";

    jaVistos.add(campo.chave);
    aceitas.push({
      campo: campo.chave,
      valor: valor.slice(0, campo.tamanhoMaximo),
      origem,
      confianca,
      justificativa: (bruta.justificativa ?? "").trim().slice(0, 400),
    });
  }

  return aceitas;
}

export type ResultadoDaIa = {
  sugestoes: SugestaoProposta[];
  observacao: string;
  requestId: string;
  model: string;
  estimatedCostUsd: number;
  latencyMs: number;
};

/**
 * Chama o Ávila AI Core em modo saída estruturada. O tenant é sempre montado
 * aqui, a partir da organização do cadastro e do admin logado — nunca vem do
 * corpo da requisição, para telemetria e orçamento não poderem ser atribuídos
 * a outra organização por um cliente malicioso.
 */
export async function gerarSugestoesDaIa(
  retrato: RetratoCadastro,
  tenant: TenantContext,
  modelo = MODELO_PADRAO,
): Promise<ResultadoDaIa> {
  const client = new AiCoreStructuredClient({
    keyProvider: new PrismaKeyProvider(),
    telemetrySink: new PrismaTelemetrySink(),
    spendGuard: new PrismaSpendGuard(),
    timeoutMs: 30_000,
  });

  const resultado = await client.complete<SugestoesDaIa>({
    tenant,
    model: modelo,
    instructions: INSTRUCOES,
    input: montarContexto(retrato),
    schemaName: "sugestoes_cadastro",
    // O pacote traz o zod 3 e o app usa o zod 4: o safeParse é idêntico nas
    // duas, só os tipos não conversam. O JSON Schema vai pronto, convertido
    // pela major certa, e o cast fica neste ponto único.
    schema: SCHEMA_SUGESTOES as never,
    jsonSchema: jsonSchemaDasSugestoes(),
  });

  return {
    sugestoes: filtrarSugestoes(resultado.data.sugestoes, retrato, "IA"),
    observacao: (resultado.data.observacao ?? "").trim().slice(0, 1000),
    requestId: resultado.requestId,
    model: resultado.model,
    estimatedCostUsd: resultado.estimatedCostUsd,
    latencyMs: resultado.latencyMs,
  };
}
