import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buscarClientes, lerFiltro, POR_PAGINA, type FiltroClientes } from "@/lib/clientes-busca";
import { excluirCliente, impedimentosDeExclusao, mudarStatus } from "@/lib/clientes-exclusao";
import { prisma } from "@/lib/prisma";

/**
 * Busca, paginação, arquivamento e exclusão de clientes, contra Postgres de
 * verdade: a busca é SQL com a função `operations.texto_busca` da migração, e
 * a exclusão depende das cascatas do banco.
 */

const PREFIXO = "teste-busca-clientes-";
const ADMIN = "admin-de-teste";

async function limpar() {
  await prisma.organization.deleteMany({ where: { slug: { startsWith: PREFIXO } } });
}

async function criar(dados: {
  name: string;
  legalName?: string;
  cpfCnpj?: string;
  status?: string;
  contato?: { name: string; email?: string; whatsapp?: string };
}) {
  const sufixo = Math.floor(Math.random() * 1e9).toString(36);
  return prisma.organization.create({
    data: {
      name: dados.name,
      slug: `${PREFIXO}${sufixo}`,
      legalName: dados.legalName,
      cpfCnpj: dados.cpfCnpj,
      status: dados.status ?? "ACTIVE",
      contacts: dados.contato ? { create: { ...dados.contato, isPrimary: true } } : undefined,
    },
  });
}

function filtro(parcial: Partial<FiltroClientes>): FiltroClientes {
  return { q: "", status: "todos", ordem: "nome", pagina: 1, ...parcial };
}

/**
 * Nomes devolvidos pela busca. Os clientes deste arquivo levam a palavra
 * "Zequivo" para não se misturarem com os que outras suítes (e a semeadura
 * dos prints) deixam no banco de teste.
 */
async function nomes(parcial: Partial<FiltroClientes>) {
  const resultado = await buscarClientes(filtro(parcial));
  return resultado.itens.map((item) => item.name);
}

let brilho = "";

beforeAll(async () => {
  await limpar();
  brilho = (
    await criar({
      name: "Brilhax Joias Zequivo",
      legalName: "BRILHAX COMÉRCIO DE JÓIAS LTDA",
      cpfCnpj: "11222333000181",
      contato: { name: "Márcia Andrade", email: "marcia@brilhax.test", whatsapp: "(19) 99876-5432" },
    })
  ).id;
  await criar({ name: "Padaria São João Zequivo", status: "ONBOARDING" });
  await criar({ name: "Padaria Antiga Zequivo", status: "ARCHIVED" });
});
afterAll(limpar);

describe("lerFiltro", () => {
  it("troca valor desconhecido pelo padrão em vez de confiar na URL", () => {
    expect(lerFiltro({ status: "DROP TABLE", ordem: "x", pagina: "-3", q: "  oi  " })).toEqual({
      q: "oi",
      status: "abertos",
      ordem: "nome",
      pagina: 1,
    });
  });
});

describe("busca", () => {
  it("ignora acento e caixa", async () => {
    expect(await nomes({ q: "joias" })).toContain("Brilhax Joias Zequivo");
    expect(await nomes({ q: "COMERCIO" })).toContain("Brilhax Joias Zequivo");
    expect(await nomes({ q: "sao joao" })).toContain("Padaria São João Zequivo");
  });

  it("acha pelo CNPJ inteiro, pela metade ou com máscara", async () => {
    expect(await nomes({ q: "11222333000181" })).toEqual(["Brilhax Joias Zequivo"]);
    expect(await nomes({ q: "11.222.333" })).toEqual(["Brilhax Joias Zequivo"]);
  });

  it("acha pelo contato: nome, e-mail e telefone", async () => {
    expect(await nomes({ q: "marcia" })).toEqual(["Brilhax Joias Zequivo"]);
    expect(await nomes({ q: "marcia@brilhax" })).toEqual(["Brilhax Joias Zequivo"]);
    expect(await nomes({ q: "98765432" })).toEqual(["Brilhax Joias Zequivo"]);
  });

  it("várias palavras precisam bater todas", async () => {
    expect(await nomes({ q: "padaria joao zequivo" })).toEqual(["Padaria São João Zequivo"]);
  });

  it("trata % e _ como texto, não como curinga", async () => {
    expect(await nomes({ q: "%" })).toEqual([]);
  });

  it("deixa arquivado fora do padrão e mostra quando pedido", async () => {
    expect(await nomes({ q: "padaria zequivo", status: "abertos" })).toEqual(["Padaria São João Zequivo"]);
    expect(await nomes({ q: "padaria zequivo", status: "ARCHIVED" })).toEqual(["Padaria Antiga Zequivo"]);
  });
});

describe("paginação", () => {
  it("corta em páginas e conta o total no banco", async () => {
    const criados = await Promise.all(
      Array.from({ length: POR_PAGINA + 5 }, (_, i) => criar({ name: `Lote Paginação ${String(i).padStart(3, "0")}` })),
    );
    const primeira = await buscarClientes(filtro({ q: "lote paginacao" }));
    const segunda = await buscarClientes(filtro({ q: "lote paginacao", pagina: 2 }));

    expect(primeira.total).toBe(criados.length);
    expect(primeira.itens).toHaveLength(POR_PAGINA);
    expect(primeira.paginas).toBe(2);
    expect(segunda.itens).toHaveLength(5);
    expect(segunda.inicio).toBe(POR_PAGINA + 1);
    const ids = new Set([...primeira.itens, ...segunda.itens].map((item) => item.id));
    expect(ids.size).toBe(criados.length);
  });
});

describe("arquivar e excluir", () => {
  it("arquiva e reativa, registrando na auditoria", async () => {
    const cliente = await criar({ name: "Cliente Para Arquivar" });
    await mudarStatus(cliente.id, "ARCHIVED", ADMIN);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: cliente.id } })).status).toBe("ARCHIVED");
    await mudarStatus(cliente.id, "ACTIVE", ADMIN);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: cliente.id } })).status).toBe("ACTIVE");
    const eventos = await prisma.operationsAuditEvent.count({ where: { organizationId: cliente.id } });
    expect(eventos).toBe(2);
  });

  it("exige o nome digitado", async () => {
    const cliente = await criar({ name: "Cliente Errado" });
    const resultado = await excluirCliente(cliente.id, "outro nome", ADMIN);
    expect(resultado).toMatchObject({ ok: false, motivo: "confirmacao" });
    expect(await prisma.organization.count({ where: { id: cliente.id } })).toBe(1);
  });

  it("exclui cliente sem operação, com cascata, e deixa o registro na auditoria", async () => {
    const cliente = await criar({ name: "Cadastro Duplicado", contato: { name: "Fulano" } });
    const resultado = await excluirCliente(cliente.id, "cadastro duplicado", ADMIN);

    expect(resultado).toEqual({ ok: true });
    expect(await prisma.organization.count({ where: { id: cliente.id } })).toBe(0);
    expect(await prisma.organizationContact.count({ where: { organizationId: cliente.id } })).toBe(0);
    const evento = await prisma.operationsAuditEvent.findFirstOrThrow({
      where: { organizationId: cliente.id, action: "ORGANIZATION_DELETED" },
    });
    expect(evento.metadata).toMatchObject({ nome: "Cadastro Duplicado" });
  });

  it("recusa excluir quem tem assinatura e manda arquivar", async () => {
    const cliente = await criar({ name: "Cliente Pagante" });
    await prisma.subscription.create({
      data: {
        organizationId: cliente.id,
        description: "Plano de teste",
        amount: 99,
        billingDay: 10,
        startedAt: new Date(),
      },
    });

    expect(await impedimentosDeExclusao(cliente.id)).toEqual([
      { motivo: "assinatura (com histórico de cobrança)", quantidade: 1 },
    ]);
    const resultado = await excluirCliente(cliente.id, "Cliente Pagante", ADMIN);
    expect(resultado).toMatchObject({ ok: false, motivo: "impedido" });
    expect(await prisma.organization.count({ where: { id: cliente.id } })).toBe(1);
  });

  it("o cliente de referência da busca continua lá", async () => {
    expect(await prisma.organization.count({ where: { id: brilho } })).toBe(1);
  });
});
