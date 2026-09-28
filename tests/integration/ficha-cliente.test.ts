import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

/**
 * Gravação da ficha do cliente (PUT /api/organizations/[id]) contra Postgres
 * de verdade.
 *
 * Até 28/09/2026 a ficha tinha três defeitos que nenhum teste pegava: não
 * havia como dar CPF/CNPJ a um cliente criado sem ele (e sem o documento o
 * assistente nunca preenchia nada pela Receita), o CPF do responsável, que
 * libera boleto e cartão na Efí, não tinha campo, e cada "Salvar ficha"
 * apagava o domínio, o provedor e as observações do site, porque a tela não
 * mandava esses campos e a API gravava `null` no lugar.
 */

vi.mock("@/lib/auth", () => ({
  getAdmin: async () => ({ id: "admin-de-teste", nome: "Teste", role: "OWNER" }),
}));

const consultaReceita = vi.fn();
vi.mock("@/lib/cnpj-lookup", () => ({
  lookupCnpj: (cnpj: string) => consultaReceita(cnpj),
}));

const { PUT } = await import("@/app/api/organizations/[id]/route");

const PREFIXO = "teste-ficha-cliente-";
const CNPJ_VALIDO = "11222333000181";
const CPF_VALIDO = "52998224725";

async function limpar() {
  await prisma.organization.deleteMany({ where: { slug: { startsWith: PREFIXO } } });
}

async function criarCliente(dados: { cpfCnpj?: string } = {}) {
  const sufixo = Math.floor(Math.random() * 1e9).toString(36);
  return prisma.organization.create({
    data: {
      name: "Brilho Teste",
      slug: `${PREFIXO}${sufixo}`,
      cpfCnpj: dados.cpfCnpj ?? null,
      webPresence: {
        create: {
          primaryDomain: "brilho.com.br",
          siteProvider: "Hostinger",
          siteNotes: "Acesso com o sobrinho do dono",
          alternativeDomains: "brilho.com",
        },
      },
    },
  });
}

/** O que a tela manda: o `FormData` inteiro, com `null` no campo que não existe. */
function corpo(extra: {
  organization?: Record<string, unknown>;
  profile?: Record<string, unknown>;
  webPresence?: Record<string, unknown>;
} = {}) {
  return {
    organization: { name: "Brilho Teste", ...extra.organization },
    profile: { ...extra.profile },
    primaryContact: {},
    primaryAddress: {},
    webPresence: {
      primaryDomain: "brilho.com.br",
      siteProvider: "Hostinger",
      siteNotes: "Acesso com o sobrinho do dono",
      alternativeDomains: "brilho.com",
      ...extra.webPresence,
    },
    socialProfiles: {},
    onboardingSteps: [],
    integrations: {},
    opportunities: {},
  };
}

async function salvar(id: string, body: unknown) {
  const request = new NextRequest(`http://localhost/api/organizations/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const resposta = await PUT(request, { params: Promise.resolve({ id }) });
  return { status: resposta.status, json: (await resposta.json()) as { error?: string; aviso?: string } };
}

beforeEach(async () => {
  consultaReceita.mockReset();
  await limpar();
});
afterAll(limpar);

describe("CPF/CNPJ na ficha", () => {
  it("grava o CNPJ de quem nasceu sem ele e guarda a consulta da Receita", async () => {
    const cliente = await criarCliente();
    consultaReceita.mockResolvedValue({ razao_social: "BRILHO TESTE LTDA", uf: "SP" });

    const { status } = await salvar(cliente.id, corpo({ organization: { cpfCnpj: "11.222.333/0001-81" } }));

    expect(status).toBe(200);
    expect(consultaReceita).toHaveBeenCalledWith(CNPJ_VALIDO);
    const salvo = await prisma.organization.findUniqueOrThrow({ where: { id: cliente.id } });
    expect(salvo.cpfCnpj).toBe(CNPJ_VALIDO);
    expect(salvo.cnpjData).toMatchObject({ razao_social: "BRILHO TESTE LTDA" });
  });

  it("grava o CNPJ mesmo com a Receita fora, e avisa", async () => {
    const cliente = await criarCliente();
    consultaReceita.mockRejectedValue(new Error("BrasilAPI respondeu HTTP 503"));

    const { status, json } = await salvar(cliente.id, corpo({ organization: { cpfCnpj: CNPJ_VALIDO } }));

    expect(status).toBe(200);
    expect(json.aviso).toContain("HTTP 503");
    const salvo = await prisma.organization.findUniqueOrThrow({ where: { id: cliente.id } });
    expect(salvo.cpfCnpj).toBe(CNPJ_VALIDO);
    expect(salvo.cnpjData).toBeNull();
  });

  it("não consulta de novo nem mexe na consulta guardada quando o documento não mudou", async () => {
    const cliente = await criarCliente({ cpfCnpj: CNPJ_VALIDO });
    await prisma.organization.update({ where: { id: cliente.id }, data: { cnpjData: { razao_social: "GUARDADA" } } });

    await salvar(cliente.id, corpo({ organization: { cpfCnpj: CNPJ_VALIDO } }));

    expect(consultaReceita).not.toHaveBeenCalled();
    const salvo = await prisma.organization.findUniqueOrThrow({ where: { id: cliente.id } });
    expect(salvo.cnpjData).toMatchObject({ razao_social: "GUARDADA" });
  });

  it("recusa documento inválido e documento de outro cliente", async () => {
    const outro = await criarCliente({ cpfCnpj: CNPJ_VALIDO });
    const cliente = await criarCliente();

    expect((await salvar(cliente.id, corpo({ organization: { cpfCnpj: "11222333000100" } }))).status).toBe(400);
    const repetido = await salvar(cliente.id, corpo({ organization: { cpfCnpj: CNPJ_VALIDO } }));
    expect(repetido.status).toBe(409);
    expect(repetido.json.error).toContain(outro.name);
  });
});

describe("CPF do responsável", () => {
  it("grava só números e recusa CPF inválido", async () => {
    const cliente = await criarCliente();

    expect((await salvar(cliente.id, corpo({ profile: { responsibleCpf: "111.111.111-11" } }))).status).toBe(400);
    expect((await salvar(cliente.id, corpo({ profile: { responsibleCpf: "529.982.247-25" } }))).status).toBe(200);

    const perfil = await prisma.organizationProfile.findUniqueOrThrow({ where: { organizationId: cliente.id } });
    expect(perfil.responsibleCpf).toBe(CPF_VALIDO);
  });
});

describe("presença digital", () => {
  it("salvar a ficha mantém domínio, provedor, observações e domínios alternativos", async () => {
    const cliente = await criarCliente();

    await salvar(cliente.id, corpo());

    const web = await prisma.organizationWebPresence.findUniqueOrThrow({ where: { organizationId: cliente.id } });
    expect(web.primaryDomain).toBe("brilho.com.br");
    expect(web.siteProvider).toBe("Hostinger");
    expect(web.siteNotes).toBe("Acesso com o sobrinho do dono");
    expect(web.alternativeDomains).toBe("brilho.com");
  });
});
