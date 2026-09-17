import type { TenantContext } from "@avila-ops/ai-core";
import { prisma } from "@/lib/prisma";
import { campoPorChave, cortarNoTamanho, type CampoCadastro } from "./campos";
import { analisarCadastro, valorAtual, type AnaliseCadastro, type RetratoCadastro } from "./lacunas";
import { sugestoesDaReceita } from "./receita";
import {
  AGENTE_AI_CORE,
  MODELO_PADRAO,
  PROJETO_AI_CORE,
  gerarSugestoesDaIa,
  type SugestaoProposta,
} from "./sugestoes";

/**
 * Orquestração do assistente de cadastro: lê o retrato do cliente, produz
 * propostas (Receita Federal e/ou IA), guarda na fila de revisão e grava as
 * que uma pessoa aprovar.
 *
 * A regra que atravessa o arquivo inteiro: proposta nenhuma vira dado sem
 * decisão humana, e campo com valor nunca é sobrescrito — nem no momento de
 * propor, nem no momento de gravar. O estado pode ter mudado entre as duas
 * coisas (alguém digitou o campo enquanto a sugestão esperava), então a
 * verificação acontece de novo na hora de aplicar.
 */

export type SugestaoPendente = {
  id: string;
  campo: string;
  rotulo: string;
  grupo: string;
  multilinha: boolean;
  valor: string;
  origem: string;
  confianca: string;
  justificativa: string | null;
  criadaEm: string;
};

export type PainelCadastro = {
  organizationId: string;
  nome: string;
  analise: AnaliseCadastro;
  pendentes: SugestaoPendente[];
  /** Quanto do que a IA poderia propor já está proposto e esperando decisão. */
  temPendentesDaIa: boolean;
  temDadosDeCnpj: boolean;
};

const INCLUDE_RETRATO = {
  profile: true,
  webPresence: true,
} as const;

type OrganizacaoComRetrato = {
  id: string;
  name: string;
  legalName: string | null;
  segment: string | null;
  siteUrl: string | null;
  cnpjData: unknown;
  profile: Record<string, unknown> | null;
  webPresence: Record<string, unknown> | null;
};

function montarRetrato(organizacao: OrganizacaoComRetrato): RetratoCadastro {
  return {
    organization: {
      name: organizacao.name,
      legalName: organizacao.legalName,
      segment: organizacao.segment,
      siteUrl: organizacao.siteUrl,
      cnpjData: organizacao.cnpjData,
    },
    profile: organizacao.profile,
    webPresence: organizacao.webPresence,
  };
}

export class OrganizacaoNaoEncontradaError extends Error {
  constructor() {
    super("Cliente não encontrado.");
    this.name = "OrganizacaoNaoEncontradaError";
  }
}

async function carregarOrganizacao(organizationId: string) {
  const organizacao = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: INCLUDE_RETRATO,
  });
  if (!organizacao) throw new OrganizacaoNaoEncontradaError();
  return organizacao;
}

function descreverPendente(
  registro: {
    id: string;
    field: string;
    suggestedValue: string;
    origin: string;
    confidence: string;
    rationale: string | null;
    createdAt: Date;
  },
  campo: CampoCadastro,
): SugestaoPendente {
  return {
    id: registro.id,
    campo: registro.field,
    rotulo: campo.rotulo,
    grupo: campo.grupo,
    multilinha: campo.multilinha === true,
    valor: registro.suggestedValue,
    origem: registro.origin,
    confianca: registro.confidence,
    justificativa: registro.rationale,
    criadaEm: registro.createdAt.toISOString(),
  };
}

/** Estado completo da tela: o que falta, o que está proposto e esperando. */
export async function montarPainel(organizationId: string): Promise<PainelCadastro> {
  const organizacao = await carregarOrganizacao(organizationId);
  const retrato = montarRetrato(organizacao as OrganizacaoComRetrato);
  const analise = analisarCadastro(retrato);

  const registros = await prisma.organizationRegistrationSuggestion.findMany({
    where: { organizationId, status: "PENDING" },
    orderBy: [{ createdAt: "desc" }],
    take: 40,
  });

  const pendentes: SugestaoPendente[] = [];
  for (const registro of registros) {
    const campo = campoPorChave(registro.field);
    // Campo removido do registro numa versão posterior do código: a linha
    // antiga fica no banco para auditoria, mas não é oferecida para aplicar.
    if (!campo) continue;
    pendentes.push(descreverPendente(registro, campo));
  }

  return {
    organizationId,
    nome: organizacao.name,
    analise,
    pendentes,
    temPendentesDaIa: pendentes.some((item) => item.origem === "IA"),
    temDadosDeCnpj: analise.temConsultaDeCnpj,
  };
}

export type ResumoGeracao = {
  criadas: number;
  origem: "RECEITA_FEDERAL" | "IA";
  observacao?: string;
  requestId?: string;
  estimatedCostUsd?: number;
  latencyMs?: number;
};

/**
 * Grava propostas novas, aposentando as pendentes dos mesmos campos: duas
 * sugestões concorrentes para um campo só transformariam a revisão numa
 * escolha entre textos, que não é a pergunta que a tela faz.
 */
async function persistirPropostas(
  organizationId: string,
  propostas: SugestaoProposta[],
  extras: { requestId?: string; model?: string },
): Promise<number> {
  if (propostas.length === 0) return 0;

  const campos = propostas.map((proposta) => proposta.campo);

  await prisma.$transaction([
    prisma.organizationRegistrationSuggestion.updateMany({
      where: { organizationId, status: "PENDING", field: { in: campos } },
      data: { status: "STALE", decidedAt: new Date() },
    }),
    prisma.organizationRegistrationSuggestion.createMany({
      data: propostas.map((proposta) => ({
        organizationId,
        field: proposta.campo,
        suggestedValue: proposta.valor,
        origin: proposta.origem === "IA" ? "IA" : "RECEITA_FEDERAL",
        confidence: proposta.confianca,
        rationale: proposta.justificativa || null,
        requestId: extras.requestId ?? null,
        model: extras.model ?? null,
      })),
    }),
  ]);

  return propostas.length;
}

/**
 * Preenchimento a partir da consulta de CNPJ já guardada. Não usa IA, não
 * chama rede e funciona com o Core desligado.
 */
export async function gerarPelaReceita(
  organizationId: string,
  actorId: string,
): Promise<ResumoGeracao> {
  const organizacao = await carregarOrganizacao(organizationId);
  const retrato = montarRetrato(organizacao as OrganizacaoComRetrato);
  const propostas = sugestoesDaReceita(retrato);
  const criadas = await persistirPropostas(organizationId, propostas, {});

  if (criadas > 0) {
    await prisma.operationsAuditEvent.create({
      data: {
        actorId,
        organizationId,
        action: "ORGANIZATION_REGISTRATION_SUGGESTIONS_GENERATED",
        entityType: "Organization",
        entityId: organizationId,
        metadata: { origem: "RECEITA_FEDERAL", criadas },
      },
    });
  }

  return { criadas, origem: "RECEITA_FEDERAL" };
}

/** Propostas de texto comercial, via Ávila AI Core em saída estruturada. */
export async function gerarPelaIa(
  organizationId: string,
  actorId: string,
  modelo = MODELO_PADRAO,
): Promise<ResumoGeracao> {
  const organizacao = await carregarOrganizacao(organizationId);
  const retrato = montarRetrato(organizacao as OrganizacaoComRetrato);

  // O tenant é montado no servidor a partir do cadastro e do admin logado —
  // nunca vem da requisição. Telemetria e orçamento do Core dependem disso
  // para não serem atribuídos à organização errada.
  const tenant: TenantContext = {
    organizationId,
    projectId: PROJETO_AI_CORE,
    agentId: AGENTE_AI_CORE,
    actorId,
  };

  const resultado = await gerarSugestoesDaIa(retrato, tenant, modelo);
  const criadas = await persistirPropostas(organizationId, resultado.sugestoes, {
    requestId: resultado.requestId,
    model: resultado.model,
  });

  await prisma.operationsAuditEvent.create({
    data: {
      actorId,
      organizationId,
      action: "ORGANIZATION_REGISTRATION_SUGGESTIONS_GENERATED",
      entityType: "Organization",
      entityId: organizationId,
      metadata: {
        origem: "IA",
        criadas,
        requestId: resultado.requestId,
        model: resultado.model,
        estimatedCostUsd: resultado.estimatedCostUsd,
        latencyMs: resultado.latencyMs,
      },
    },
  });

  return {
    criadas,
    origem: "IA",
    observacao: resultado.observacao,
    requestId: resultado.requestId,
    estimatedCostUsd: resultado.estimatedCostUsd,
    latencyMs: resultado.latencyMs,
  };
}

export type ResumoDecisao = {
  aplicadas: string[];
  descartadas: number;
  /** Campos que deixaram de estar vazios entre a proposta e a decisão. */
  ignoradas: string[];
};

/**
 * Grava as sugestões aprovadas e encerra as descartadas.
 *
 * Cada aprovação é reconferida contra o estado atual do cadastro: se o campo
 * foi preenchido por outra via desde que a proposta foi criada, a sugestão
 * vira STALE e o que estava escrito permanece. Trabalho de gente não é
 * sobrescrito por decisão que foi tomada com uma tela desatualizada.
 */
export async function decidirSugestoes(
  organizationId: string,
  actorId: string,
  aprovadas: string[],
  descartadas: string[],
): Promise<ResumoDecisao> {
  const organizacao = await carregarOrganizacao(organizationId);
  const retrato = montarRetrato(organizacao as OrganizacaoComRetrato);

  const ids = [...new Set([...aprovadas, ...descartadas])];
  const registros = await prisma.organizationRegistrationSuggestion.findMany({
    where: { id: { in: ids }, organizationId, status: "PENDING" },
  });

  const aprovadasSet = new Set(aprovadas);
  const agora = new Date();

  const paraGravar = new Map<string, { campo: CampoCadastro; valor: string; id: string }>();
  const stale: string[] = [];
  const ignoradas: string[] = [];

  for (const registro of registros) {
    if (!aprovadasSet.has(registro.id)) continue;

    const campo = campoPorChave(registro.field);
    if (!campo) {
      stale.push(registro.id);
      continue;
    }

    if (valorAtual(retrato, campo)) {
      stale.push(registro.id);
      ignoradas.push(campo.rotulo);
      continue;
    }

    // Duas aprovações para o mesmo campo na mesma leva: vale a primeira, e a
    // outra é aposentada em vez de gravar por cima da que acabou de entrar.
    if (paraGravar.has(campo.chave)) {
      stale.push(registro.id);
      continue;
    }

    paraGravar.set(campo.chave, {
      campo,
      valor: cortarNoTamanho(registro.suggestedValue, campo.tamanhoMaximo),
      id: registro.id,
    });
  }

  const idsDescartados = registros
    .filter((registro) => !aprovadasSet.has(registro.id))
    .map((registro) => registro.id);

  const aplicados = [...paraGravar.values()];

  await prisma.$transaction(async (transaction) => {
    const noOrganization: Record<string, string> = {};
    const noProfile: Record<string, string> = {};
    const noWebPresence: Record<string, string> = {};

    for (const { campo, valor } of aplicados) {
      if (campo.destino === "organization") noOrganization[campo.coluna] = valor;
      else if (campo.destino === "profile") noProfile[campo.coluna] = valor;
      else noWebPresence[campo.coluna] = valor;
    }

    if (Object.keys(noOrganization).length > 0) {
      await transaction.organization.update({
        where: { id: organizationId },
        data: noOrganization,
      });
    }

    if (Object.keys(noProfile).length > 0) {
      await transaction.organizationProfile.upsert({
        where: { organizationId },
        create: { organizationId, ...noProfile },
        update: noProfile,
      });
    }

    if (Object.keys(noWebPresence).length > 0) {
      await transaction.organizationWebPresence.upsert({
        where: { organizationId },
        create: { organizationId, ...noWebPresence },
        update: noWebPresence,
      });
    }

    if (aplicados.length > 0) {
      await transaction.organizationRegistrationSuggestion.updateMany({
        where: { id: { in: aplicados.map((item) => item.id) } },
        data: { status: "APPLIED", decidedBy: actorId, decidedAt: agora },
      });
    }

    if (idsDescartados.length > 0) {
      await transaction.organizationRegistrationSuggestion.updateMany({
        where: { id: { in: idsDescartados } },
        data: { status: "DISCARDED", decidedBy: actorId, decidedAt: agora },
      });
    }

    if (stale.length > 0) {
      await transaction.organizationRegistrationSuggestion.updateMany({
        where: { id: { in: stale } },
        data: { status: "STALE", decidedBy: actorId, decidedAt: agora },
      });
    }

    if (aplicados.length > 0 || idsDescartados.length > 0) {
      await transaction.operationsAuditEvent.create({
        data: {
          actorId,
          organizationId,
          action: "ORGANIZATION_REGISTRATION_SUGGESTIONS_DECIDED",
          entityType: "Organization",
          entityId: organizationId,
          metadata: {
            aplicados: aplicados.map((item) => item.campo.chave),
            descartados: idsDescartados.length,
            ignorados: ignoradas,
          },
        },
      });
    }
  });

  return {
    aplicadas: aplicados.map((item) => item.campo.rotulo),
    descartadas: idsDescartados.length,
    ignoradas,
  };
}
