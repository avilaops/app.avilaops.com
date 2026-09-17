import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  decidirSugestoes,
  gerarPelaReceita,
  montarPainel,
  OrganizacaoNaoEncontradaError,
} from "@/lib/cadastro-ia/assistente";
import { prisma } from "@/lib/prisma";

/**
 * Assistente de cadastro contra Postgres de verdade.
 *
 * O que se testa aqui não é o filtro das sugestões (isso é
 * `tests/unit/cadastro-ia`) — é o que só o banco decide: a proposta virar
 * linha na ficha do cliente, a fila não guardar duas propostas vivas para o
 * mesmo campo, e a aprovação recusar-se a passar por cima de um valor que
 * alguém digitou enquanto a sugestão esperava.
 *
 * Nenhum teste daqui chama a OpenAI. A origem exercitada é a Receita Federal,
 * que lê a consulta de CNPJ já guardada — o caminho da IA compartilha a mesma
 * fila e a mesma gravação, e diverge só na produção do texto.
 */

const PREFIXO = "teste-cadastro-ia-";
const ADMIN = "admin-de-teste";

const CNPJ_DATA = {
  razao_social: "VALE TOPOGRAFIA E PROJETOS LTDA",
  cnae_fiscal_descricao: "Serviços de agrimensura",
  cep: "38400100",
  logradouro: "DAS ACACIAS",
  numero: "120",
  bairro: "CENTRO",
  municipio: "UBERLANDIA",
  uf: "MG",
  ddd_telefone_1: "3432221100",
};

let organizationId = "";

async function limpar() {
  await prisma.organization.deleteMany({ where: { slug: { startsWith: PREFIXO } } });
}

async function criarCliente(dados: { cnpjData?: unknown; legalName?: string | null } = {}) {
  const sufixo = Math.floor(Math.random() * 1e9).toString(36);
  const organizacao = await prisma.organization.create({
    data: {
      name: "Vale Topografia",
      slug: `${PREFIXO}${sufixo}`,
      legalName: dados.legalName ?? null,
      cpfCnpj: `${Date.now()}${sufixo}`.slice(0, 14),
      cnpjData: (dados.cnpjData ?? CNPJ_DATA) as never,
    },
  });
  organizationId = organizacao.id;
  return organizacao;
}

beforeEach(limpar);
afterAll(limpar);

describe("análise de completude", () => {
  it("conta as lacunas do cliente recém-criado", async () => {
    await criarCliente();
    const painel = await montarPainel(organizationId);

    expect(painel.analise.completude).toBeLessThan(100);
    expect(painel.analise.lacunas.length).toBeGreaterThan(0);
    expect(painel.temDadosDeCnpj).toBe(true);
    expect(painel.pendentes).toEqual([]);
  });

  it("recusa cliente inexistente em vez de devolver painel vazio", async () => {
    await expect(montarPainel("nao-existe")).rejects.toBeInstanceOf(OrganizacaoNaoEncontradaError);
  });
});

describe("geração pela Receita Federal", () => {
  it("enfileira as propostas como pendentes, sem tocar na ficha", async () => {
    await criarCliente();
    const resumo = await gerarPelaReceita(organizationId, ADMIN);

    expect(resumo.criadas).toBeGreaterThan(0);

    const organizacao = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      include: { profile: true },
    });
    // Nada foi gravado: gerar propõe, não decide.
    expect(organizacao.legalName).toBeNull();
    expect(organizacao.profile).toBeNull();

    const painel = await montarPainel(organizationId);
    expect(painel.pendentes.some((item) => item.campo === "legalName")).toBe(true);
    expect(painel.pendentes.every((item) => item.origem === "RECEITA_FEDERAL")).toBe(true);
  });

  it("aposenta a proposta anterior em vez de acumular duas vivas para o mesmo campo", async () => {
    await criarCliente();
    await gerarPelaReceita(organizationId, ADMIN);
    await gerarPelaReceita(organizationId, ADMIN);

    const pendentes = await prisma.organizationRegistrationSuggestion.count({
      where: { organizationId, field: "legalName", status: "PENDING" },
    });
    const aposentadas = await prisma.organizationRegistrationSuggestion.count({
      where: { organizationId, field: "legalName", status: "STALE" },
    });

    expect(pendentes).toBe(1);
    expect(aposentadas).toBe(1);
  });

  it("não propõe o que já está preenchido", async () => {
    await criarCliente({ legalName: "Razão social digitada pela equipe" });
    await gerarPelaReceita(organizationId, ADMIN);

    const painel = await montarPainel(organizationId);
    expect(painel.pendentes.some((item) => item.campo === "legalName")).toBe(false);
  });

  it("registra evento de auditoria da geração", async () => {
    await criarCliente();
    await gerarPelaReceita(organizationId, ADMIN);

    const evento = await prisma.operationsAuditEvent.findFirst({
      where: { organizationId, action: "ORGANIZATION_REGISTRATION_SUGGESTIONS_GENERATED" },
    });
    expect(evento?.actorId).toBe(ADMIN);
  });
});

describe("decisão sobre as sugestões", () => {
  it("grava só o que foi aprovado, nos destinos certos", async () => {
    await criarCliente();
    await gerarPelaReceita(organizationId, ADMIN);

    const painel = await montarPainel(organizationId);
    const razaoSocial = painel.pendentes.find((item) => item.campo === "legalName")!;
    const cidade = painel.pendentes.find((item) => item.campo === "city")!;
    const bairro = painel.pendentes.find((item) => item.campo === "district")!;

    const resumo = await decidirSugestoes(
      organizationId,
      ADMIN,
      [razaoSocial.id, cidade.id],
      [bairro.id],
    );

    expect(resumo.aplicadas).toHaveLength(2);
    expect(resumo.descartadas).toBe(1);

    const organizacao = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      include: { profile: true },
    });
    // Destino de cada campo: um na organização, outro no perfil, que nem
    // existia antes desta gravação.
    expect(organizacao.legalName).toBe("VALE TOPOGRAFIA E PROJETOS LTDA");
    expect(organizacao.profile?.city).toBe("UBERLANDIA");
    expect(organizacao.profile?.district).toBeNull();

    const decididas = await prisma.organizationRegistrationSuggestion.findMany({
      where: { organizationId, id: { in: [razaoSocial.id, cidade.id, bairro.id] } },
    });
    expect(decididas.filter((item) => item.status === "APPLIED")).toHaveLength(2);
    expect(decididas.filter((item) => item.status === "DISCARDED")).toHaveLength(1);
    expect(decididas.every((item) => item.decidedBy === ADMIN)).toBe(true);
  });

  it("não sobrescreve o campo preenchido entre a proposta e a decisão", async () => {
    await criarCliente();
    await gerarPelaReceita(organizationId, ADMIN);

    const painel = await montarPainel(organizationId);
    const razaoSocial = painel.pendentes.find((item) => item.campo === "legalName")!;

    // Alguém digita o campo enquanto a sugestão espera na fila.
    await prisma.organization.update({
      where: { id: organizationId },
      data: { legalName: "Digitado à mão depois da proposta" },
    });

    const resumo = await decidirSugestoes(organizationId, ADMIN, [razaoSocial.id], []);

    expect(resumo.aplicadas).toEqual([]);
    expect(resumo.ignoradas).toContain("Razão social");

    const organizacao = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    expect(organizacao.legalName).toBe("Digitado à mão depois da proposta");

    const sugestao = await prisma.organizationRegistrationSuggestion.findUniqueOrThrow({
      where: { id: razaoSocial.id },
    });
    expect(sugestao.status).toBe("STALE");
  });

  it("ignora sugestão de outro cliente passada na mesma chamada", async () => {
    await criarCliente();
    const primeiro = organizationId;
    await gerarPelaReceita(primeiro, ADMIN);
    const alheia = (await montarPainel(primeiro)).pendentes.find(
      (item) => item.campo === "legalName",
    )!;

    await criarCliente();
    const segundo = organizationId;

    const resumo = await decidirSugestoes(segundo, ADMIN, [alheia.id], []);
    expect(resumo.aplicadas).toEqual([]);

    const intacta = await prisma.organizationRegistrationSuggestion.findUniqueOrThrow({
      where: { id: alheia.id },
    });
    expect(intacta.status).toBe("PENDING");
  });

  it("a sugestão aplicada sai da fila e a completude sobe", async () => {
    await criarCliente();
    await gerarPelaReceita(organizationId, ADMIN);

    const antes = await montarPainel(organizationId);
    const ids = antes.pendentes.map((item) => item.id);

    await decidirSugestoes(organizationId, ADMIN, ids, []);

    const depois = await montarPainel(organizationId);
    expect(depois.pendentes).toEqual([]);
    expect(depois.analise.completude).toBeGreaterThan(antes.analise.completude);
  });
});
