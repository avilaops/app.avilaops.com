import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

/**
 * As regras do cadastro que só o banco garante.
 *
 * O que se testa aqui não é o que a API aceita — é o que o Postgres recusa
 * quando alguém escreve por fora: script de importação, n8n, correção manual
 * por SQL. Antes desta migração o banco aceitava CNPJ com dígito errado,
 * `status` inventado, três endereços "principais" do mesmo tipo e pessoa
 * física com CNPJ de 14 dígitos. Cada teste abaixo corresponde a uma dessas
 * aceitações que deixou de existir.
 *
 * Precisa de Postgres de verdade: `npm run db:test:up` e
 * `npx prisma migrate deploy`.
 */

const PREFIXO = "teste-cadastro-fiscal-";

const CNPJ_VALIDO = "11222333000181";
const CNPJ_INVALIDO = "11222333000182";
const CNPJ_ALFANUMERICO = "12ABC34501DE35";
const CPF_VALIDO = "52998224725";
const CPF_INVALIDO = "52998224726";

async function limpar() {
  await prisma.organization.deleteMany({ where: { slug: { startsWith: PREFIXO } } });
}

async function criarCliente(
  dados: { cpfCnpj?: string | null; legalName?: string | null; status?: string } = {},
) {
  const sufixo = Math.floor(Math.random() * 1e9).toString(36);
  return prisma.organization.create({
    data: {
      name: "Cliente de teste",
      slug: `${PREFIXO}${sufixo}`,
      legalName: dados.legalName === undefined ? "Cliente de Teste LTDA" : dados.legalName,
      cpfCnpj: dados.cpfCnpj === undefined ? CNPJ_VALIDO : dados.cpfCnpj,
      ...(dados.status ? { status: dados.status } : {}),
    },
  });
}

beforeEach(limpar);
afterAll(limpar);

describe("documento do cliente", () => {
  it("aceita CNPJ e CPF válidos", async () => {
    await expect(criarCliente({ cpfCnpj: CNPJ_VALIDO })).resolves.toBeTruthy();
    await expect(criarCliente({ cpfCnpj: CPF_VALIDO })).resolves.toBeTruthy();
  });

  it("aceita o CNPJ alfanumérico que passou a existir em julho de 2026", async () => {
    const cliente = await criarCliente({ cpfCnpj: CNPJ_ALFANUMERICO });
    expect(cliente.cpfCnpj).toBe(CNPJ_ALFANUMERICO);
  });

  it("recusa CNPJ com dígito verificador errado", async () => {
    await expect(criarCliente({ cpfCnpj: CNPJ_INVALIDO })).rejects.toThrow();
  });

  it("recusa CPF com dígito verificador errado", async () => {
    await expect(criarCliente({ cpfCnpj: CPF_INVALIDO })).rejects.toThrow();
  });

  it("recusa documento com máscara, para não existirem dois cadastros do mesmo CNPJ", async () => {
    await expect(criarCliente({ cpfCnpj: "11.222.333/0001-81" })).rejects.toThrow();
  });

  it("aceita cliente sem documento: a ficha nasce antes de alguém informar", async () => {
    await expect(criarCliente({ cpfCnpj: null })).resolves.toBeTruthy();
  });
});

describe("domínios fechados", () => {
  it("aceita os quatro status que a aplicação conhece", async () => {
    for (const status of ["ACTIVE", "ONBOARDING", "PAUSED", "ARCHIVED"]) {
      await expect(criarCliente({ cpfCnpj: null, status })).resolves.toBeTruthy();
    }
  });

  it("recusa status fora do domínio", async () => {
    const cliente = await criarCliente({ cpfCnpj: null });
    await expect(
      prisma.organization.update({ where: { id: cliente.id }, data: { status: "INVENTADO" } }),
    ).rejects.toThrow();
  });

  it("recusa tipo de endereço fora do domínio", async () => {
    const cliente = await criarCliente({ cpfCnpj: null });
    await expect(
      prisma.organizationAddress.create({
        data: { organizationId: cliente.id, type: "CASA_DA_SOGRA", city: "Lugar" },
      }),
    ).rejects.toThrow();
  });

  it("aceita as origens de endereço que a aplicação grava e recusa origem inventada", async () => {
    const cliente = await criarCliente({ cpfCnpj: null });

    // `FICHA_PDF` é o cadastro a partir da ficha assinada pelo cliente: vale
    // mais que endereço digitado por quem atendeu, e precisa caber no domínio.
    for (const [i, source] of ["MANUAL", "FICHA_PDF", "RECEITA_FEDERAL"].entries()) {
      await expect(
        prisma.organizationAddress.create({
          data: { organizationId: cliente.id, city: `Cidade ${i}`, source },
        }),
      ).resolves.toBeTruthy();
    }

    await expect(
      prisma.organizationAddress.create({
        data: { organizationId: cliente.id, city: "Lugar", source: "ACHISMO" },
      }),
    ).rejects.toThrow();
  });

  it("recusa tipo de contato fora do domínio", async () => {
    const cliente = await criarCliente({ cpfCnpj: null });
    await expect(
      prisma.organizationContact.create({
        data: { organizationId: cliente.id, type: "AMIGO", name: "Alguém" },
      }),
    ).rejects.toThrow();
  });
});

describe("endereço", () => {
  it("permite um principal por tipo e recusa o segundo do mesmo tipo", async () => {
    const cliente = await criarCliente({ cpfCnpj: null });

    await prisma.organizationAddress.create({
      data: { organizationId: cliente.id, type: "MAIN", city: "São Paulo", isPrimary: true },
    });
    // Cobrança e entrega em endereços próprios é o ponto de ter tipo.
    await prisma.organizationAddress.create({
      data: { organizationId: cliente.id, type: "BILLING", city: "Campinas", isPrimary: true },
    });
    await prisma.organizationAddress.create({
      data: { organizationId: cliente.id, type: "DELIVERY", city: "Santos", isPrimary: true },
    });

    await expect(
      prisma.organizationAddress.create({
        data: { organizationId: cliente.id, type: "MAIN", city: "Outra", isPrimary: true },
      }),
    ).rejects.toThrow();

    // Secundário do mesmo tipo continua permitido: o cadastro guarda histórico.
    await expect(
      prisma.organizationAddress.create({
        data: { organizationId: cliente.id, type: "MAIN", city: "Antiga", isPrimary: false },
      }),
    ).resolves.toBeTruthy();
  });

  it("recusa código IBGE que não tenha sete dígitos", async () => {
    const cliente = await criarCliente({ cpfCnpj: null });
    await expect(
      prisma.organizationAddress.create({
        data: { organizationId: cliente.id, city: "São Paulo", municipioIbge: "355030" },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.organizationAddress.create({
        data: { organizationId: cliente.id, city: "São Paulo", municipioIbge: "3550308" },
      }),
    ).resolves.toBeTruthy();
  });

  it("recusa país que não esteja em ISO 3166-1 alpha-2", async () => {
    const cliente = await criarCliente({ cpfCnpj: null });
    await expect(
      prisma.organizationAddress.create({
        data: { organizationId: cliente.id, city: "Lisboa", paisIso: "Portugal" },
      }),
    ).rejects.toThrow();
  });
});

describe("contato", () => {
  it("recusa dois contatos principais no mesmo cliente", async () => {
    const cliente = await criarCliente({ cpfCnpj: null });
    await prisma.organizationContact.create({
      data: { organizationId: cliente.id, type: "OWNER", name: "Dono", isPrimary: true },
    });
    await expect(
      prisma.organizationContact.create({
        data: { organizationId: cliente.id, type: "FINANCE", name: "Financeiro", isPrimary: true },
      }),
    ).rejects.toThrow();
  });
});

describe("ficha fiscal", () => {
  it("guarda o bloco tributário do destinatário", async () => {
    const cliente = await criarCliente();
    const fiscal = await prisma.dadosFiscaisDoCliente.create({
      data: {
        organizationId: cliente.id,
        tipoPessoa: "JURIDICA",
        regimeTributario: "SIMPLES_NACIONAL",
        indicadorInscricaoEstadual: "NAO_CONTRIBUINTE",
        inscricaoMunicipal: "123456",
        cnae: "1091102",
        cpfResponsavel: CPF_VALIDO,
        emailFiscal: "fiscal@cliente.test",
      },
    });
    expect(fiscal.regimeTributario).toBe("SIMPLES_NACIONAL");
  });

  it("recusa pessoa física com CNPJ de 14 caracteres", async () => {
    const cliente = await criarCliente({ cpfCnpj: CNPJ_VALIDO });
    await expect(
      prisma.dadosFiscaisDoCliente.create({
        data: { organizationId: cliente.id, tipoPessoa: "FISICA" },
      }),
    ).rejects.toThrow();
  });

  it("recusa trocar o documento para CPF em cliente marcado como pessoa jurídica", async () => {
    const cliente = await criarCliente({ cpfCnpj: CNPJ_VALIDO });
    await prisma.dadosFiscaisDoCliente.create({
      data: { organizationId: cliente.id, tipoPessoa: "JURIDICA" },
    });
    await expect(
      prisma.organization.update({ where: { id: cliente.id }, data: { cpfCnpj: CPF_VALIDO } }),
    ).rejects.toThrow();
  });

  it("recusa CNAE fora de formato e CPF de responsável inválido", async () => {
    const cliente = await criarCliente();
    await expect(
      prisma.dadosFiscaisDoCliente.create({
        data: { organizationId: cliente.id, cnae: "109" },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.dadosFiscaisDoCliente.create({
        data: { organizationId: cliente.id, cpfResponsavel: CPF_INVALIDO },
      }),
    ).rejects.toThrow();
  });

  it("recusa ISS retido sem alíquota: a prefeitura precisa do percentual", async () => {
    const cliente = await criarCliente();
    await expect(
      prisma.dadosFiscaisDoCliente.create({
        data: { organizationId: cliente.id, issRetido: true },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.dadosFiscaisDoCliente.create({
        data: { organizationId: cliente.id, issRetido: true, aliquotaIssRetido: "2.00" },
      }),
    ).resolves.toBeTruthy();
  });

  it("recusa NIF em cliente que não é estrangeiro", async () => {
    const cliente = await criarCliente();
    await expect(
      prisma.dadosFiscaisDoCliente.create({
        data: { organizationId: cliente.id, tipoPessoa: "JURIDICA", nif: "PT123456789" },
      }),
    ).rejects.toThrow();
  });

  it("recusa inscrição estadual em quem está marcado como isento", async () => {
    const cliente = await criarCliente();
    await expect(
      prisma.dadosFiscaisDoCliente.create({
        data: {
          organizationId: cliente.id,
          indicadorInscricaoEstadual: "ISENTO",
          inscricaoEstadual: "123456789",
        },
      }),
    ).rejects.toThrow();
  });
});

describe("pendências e completude", () => {
  type Pendencia = { codigo: string; impede: string };
  type Completude = {
    pendencias_para_emitir_nota: bigint;
    pendencias_para_cobrar: bigint;
    pode_emitir_nota: boolean;
  };

  async function pendencias(organizationId: string) {
    return prisma.$queryRaw<Pendencia[]>`
      SELECT codigo, impede FROM operations.cadastro_pendencias
       WHERE organization_id = ${organizationId}
       ORDER BY codigo`;
  }

  it("lista o que falta em cliente recém-criado", async () => {
    const cliente = await criarCliente({ cpfCnpj: null, legalName: null });
    const codigos = (await pendencias(cliente.id)).map((p) => p.codigo);

    expect(codigos).toContain("DOCUMENTO_AUSENTE");
    expect(codigos).toContain("RAZAO_SOCIAL_AUSENTE");
    expect(codigos).toContain("ENDERECO_AUSENTE");
    expect(codigos).toContain("REGIME_NAO_INFORMADO");
    expect(codigos).toContain("INDICADOR_IE_AUSENTE");
    expect(codigos).toContain("CPF_RESPONSAVEL_AUSENTE");
  });

  it("não sobra pendência quando o cadastro está completo", async () => {
    const cliente = await criarCliente();
    await prisma.organizationAddress.create({
      data: {
        organizationId: cliente.id,
        type: "MAIN",
        postalCode: "01310100",
        city: "São Paulo",
        state: "SP",
        municipioIbge: "3550308",
        paisIso: "BR",
        isPrimary: true,
      },
    });
    await prisma.dadosFiscaisDoCliente.create({
      data: {
        organizationId: cliente.id,
        regimeTributario: "SIMPLES_NACIONAL",
        indicadorInscricaoEstadual: "NAO_CONTRIBUINTE",
        cpfResponsavel: CPF_VALIDO,
        emailFiscal: "fiscal@cliente.test",
      },
    });

    expect(await pendencias(cliente.id)).toHaveLength(0);

    const [completude] = await prisma.$queryRaw<Completude[]>`
      SELECT pendencias_para_emitir_nota, pendencias_para_cobrar, pode_emitir_nota
        FROM operations.cadastro_completude
       WHERE organization_id = ${cliente.id}`;
    expect(Number(completude.pendencias_para_emitir_nota)).toBe(0);
    expect(Number(completude.pendencias_para_cobrar)).toBe(0);
    expect(completude.pode_emitir_nota).toBe(true);
  });

  it("escolhe o endereço fiscal na frente do principal na ficha fiscal", async () => {
    const cliente = await criarCliente();
    await prisma.organizationAddress.create({
      data: {
        organizationId: cliente.id,
        type: "MAIN",
        city: "São Paulo",
        municipioIbge: "3550308",
        isPrimary: true,
      },
    });
    await prisma.organizationAddress.create({
      data: {
        organizationId: cliente.id,
        type: "FISCAL",
        city: "Campinas",
        municipioIbge: "3509502",
        isPrimary: true,
      },
    });

    const [ficha] = await prisma.$queryRaw<
      { endereco_tipo: string; municipio: string; municipio_ibge: string }[]
    >`
      SELECT endereco_tipo, municipio, municipio_ibge
        FROM operations.cliente_ficha_fiscal
       WHERE organization_id = ${cliente.id}`;

    expect(ficha.endereco_tipo).toBe("FISCAL");
    expect(ficha.municipio_ibge).toBe("3509502");
  });
});

describe("auditoria do cadastro", () => {
  it("grava antes e depois de cada mudança na ficha fiscal", async () => {
    const cliente = await criarCliente();
    const fiscal = await prisma.dadosFiscaisDoCliente.create({
      data: { organizationId: cliente.id, regimeTributario: "MEI" },
    });
    await prisma.dadosFiscaisDoCliente.update({
      where: { id: fiscal.id },
      data: { regimeTributario: "SIMPLES_NACIONAL" },
    });

    const eventos = await prisma.coreAuditEvent.findMany({
      where: { entityType: "dados_fiscais_do_cliente", entityId: fiscal.id },
      orderBy: { id: "asc" },
    });

    expect(eventos.map((e) => e.action)).toEqual(["INSERT", "UPDATE"]);
    const alteracao = eventos[1];
    expect((alteracao.beforeData as { regime_tributario: string }).regime_tributario).toBe("MEI");
    expect((alteracao.afterData as { regime_tributario: string }).regime_tributario).toBe(
      "SIMPLES_NACIONAL",
    );
  });
});
