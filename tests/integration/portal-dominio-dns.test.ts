import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma, PrismaClient } from "@prisma/client";
import type { DnsProvider, EntradaRegistroDns, RegistroDns } from "@/lib/dominios/dns/tipos";

/**
 * O cliente editando a própria zona. O que estes testes seguram é a fronteira
 * entre empresas e a trilha: domínio de outra empresa não existe para quem
 * pergunta, registro que derrubaria e-mail não sai, e toda escrita deixa
 * antes, depois e origem.
 *
 * O servidor de DNS é um falso em memória: o que importa aqui é o que chega
 * nele (ou não chega), não o protocolo.
 */

const state = vi.hoisted(() => ({ tx: null as unknown, zona: [] as RegistroDns[], chamadas: [] as string[] }));
vi.mock("@/lib/prisma", () => ({ get prisma() { return state.tx; } }));
vi.mock("@/lib/dominios/dns", async (original) => {
  const real = await original<typeof import("@/lib/dominios/dns")>();
  const falso: DnsProvider = {
    adaptador: "falso",
    configurado: () => true,
    podeEditar: () => true,
    verificar: async () => ({ adaptador: "falso", configurado: true, operacional: true, ambiente: null, verificadoEm: null, erro: null }),
    listar: async () => state.zona.map((r) => ({ ...r })),
    criar: async (_zona: string, e: EntradaRegistroDns) => {
      state.chamadas.push(`criar ${e.tipo} ${e.nome}`);
      const novo: RegistroDns = { id: randomUUID(), tipo: e.tipo, nome: e.nome, conteudo: e.conteudo, ttl: e.ttl ?? 1, proxy: false, prioridade: e.prioridade ?? null };
      state.zona.push(novo);
      return novo;
    },
    atualizar: async (_zona: string, id: string, e: EntradaRegistroDns) => {
      state.chamadas.push(`alterar ${id}`);
      const i = state.zona.findIndex((r) => r.id === id);
      state.zona[i] = { ...state.zona[i], tipo: e.tipo, nome: e.nome, conteudo: e.conteudo };
      return state.zona[i];
    },
    remover: async (_zona: string, id: string) => {
      state.chamadas.push(`apagar ${id}`);
      state.zona = state.zona.filter((r) => r.id !== id);
    },
  };
  return {
    ...real,
    provedorDeDnsDoDominio: (d: { dnsProvider: string | null | undefined }) =>
      real.lerServicoDeDns(d.dnsProvider) === "NENHUM" ? null : falso,
  };
});

import { ErroDeDns, executarOperacaoDns } from "@/lib/dominios/dns/escrita";
import { carregarDominioDoCliente } from "@/lib/portal-dominio";

if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Use banco descartável _test.");
const db = new PrismaClient();
const rollback = new Error("rollback");

type Cenario = { tx: Prisma.TransactionClient; id: string; org: string; fqdn: string; outroFqdn: string };

async function isolado(teste: (c: Cenario) => Promise<void>) {
  try {
    await db.$transaction(async (tx) => {
      state.tx = tx;
      const id = randomUUID();
      const org = await tx.organization.create({ data: { name: "Cliente DNS", slug: id } });
      const outra = await tx.organization.create({ data: { name: "Outra empresa", slug: randomUUID() } });
      await tx.adminIdentity.create({
        data: { id, nome: "Dona", email: `${id}@example.invalid`, senhaHash: "x", senhaProvisoria: false, role: "ADMIN", ativo: true, organizationId: org.id },
      });
      const fqdn = `${id.slice(0, 8)}.com.br`;
      const outroFqdn = `outra-${id.slice(0, 8)}.com.br`;
      await tx.domainAsset.create({ data: { organizationId: org.id, fqdn, dnsProvider: "EXTERNO", cloudflareZoneId: `zona-${id}` } });
      await tx.domainAsset.create({ data: { organizationId: outra.id, fqdn: outroFqdn, dnsProvider: "EXTERNO", cloudflareZoneId: `zona-outra-${id}` } });
      await teste({ tx, id, org: org.id, fqdn, outroFqdn });
      throw rollback;
    }, { timeout: 30_000 });
  } catch (erro) {
    if (erro !== rollback) throw erro;
  } finally {
    state.tx = null;
  }
}

beforeEach(() => {
  state.zona = [
    { id: "spf", tipo: "TXT", nome: "@", conteudo: "v=spf1 include:_spf.provedor.com ~all", ttl: 1, proxy: false, prioridade: null },
    { id: "mx", tipo: "MX", nome: "@", conteudo: "mx1.provedor.com", ttl: 1, proxy: false, prioridade: 10 },
  ];
  state.chamadas = [];
});
afterAll(() => db.$disconnect());

describe("DNS pelo portal do cliente", () => {
  it("domínio de outra empresa responde como inexistente e nada chega ao servidor", () => isolado(async ({ id, org, outroFqdn }) => {
    const tentativa = executarOperacaoDns(
      outroFqdn,
      { acao: "apagar", registroId: "mx" },
      { id, origem: "CLIENTE" },
      { organizationId: org },
    );
    await expect(tentativa).rejects.toMatchObject({ status: 404 });
    expect(state.chamadas).toEqual([]);
    expect(await carregarDominioDoCliente(id, org, outroFqdn)).toBeNull();
  }));

  it("segundo SPF é recusado antes de sair, sem gravar nada", () => isolado(async ({ tx, id, org, fqdn }) => {
    const tentativa = executarOperacaoDns(
      fqdn,
      { acao: "criar", entrada: { tipo: "TXT", nome: "@", conteudo: "v=spf1 include:outro.com -all" } },
      { id, origem: "CLIENTE" },
      { organizationId: org },
    );
    await expect(tentativa).rejects.toBeInstanceOf(ErroDeDns);
    await expect(tentativa).rejects.toMatchObject({ status: 422 });
    expect(state.chamadas).toEqual([]);
    expect(await tx.operationsAuditEvent.count({ where: { organizationId: org } })).toBe(0);
  }));

  it("criar e apagar deixam antes, depois e origem na trilha", () => isolado(async ({ tx, id, org, fqdn }) => {
    const criado = await executarOperacaoDns(
      fqdn,
      { acao: "criar", entrada: { tipo: "A", nome: "loja", conteudo: "203.0.113.10", ttl: 300 } },
      { id, origem: "CLIENTE" },
      { organizationId: org },
    );
    expect(criado?.conteudo).toBe("203.0.113.10");

    await executarOperacaoDns(fqdn, { acao: "apagar", registroId: "mx" }, { id, origem: "CLIENTE" }, { organizationId: org });

    const eventos = await tx.operationsAuditEvent.findMany({ where: { organizationId: org }, orderBy: { id: "asc" } });
    expect(eventos.map((e) => e.action)).toEqual(["DNS_REGISTRO_CRIADO", "DNS_REGISTRO_APAGADO"]);
    expect(eventos[0]).toMatchObject({ actorId: id, metadata: { origem: "CLIENTE", antes: null, depois: { tipo: "A", nome: `loja.${fqdn}` } } });
    expect(eventos[1]).toMatchObject({ metadata: { origem: "CLIENTE", antes: { tipo: "MX", conteudo: "mx1.provedor.com" }, depois: null } });

    const dominio = await carregarDominioDoCliente(id, org, fqdn);
    expect(dominio?.historico.map((h) => h.acao)).toEqual(["Registro de DNS apagado", "Registro de DNS criado"]);
    expect(dominio?.historico[0]).toMatchObject({ quem: "Dona", resumo: "MX @ → mx1.provedor.com" });
    expect(dominio?.dns.registros.map((r) => r.tipo).sort()).toEqual(["A", "TXT"]);
  }));

  it("registro que sumiu da zona não é apagado às cegas", () => isolado(async ({ id, org, fqdn }) => {
    const tentativa = executarOperacaoDns(fqdn, { acao: "apagar", registroId: "nao-existe" }, { id, origem: "CLIENTE" }, { organizationId: org });
    await expect(tentativa).rejects.toMatchObject({ status: 404 });
    expect(state.chamadas).toEqual([]);
  }));

  it("domínio sem DNS por aqui não mostra zona nem aceita escrita", () => isolado(async ({ tx, id, org }) => {
    const fqdn = `sem-dns-${id.slice(0, 8)}.com.br`;
    await tx.domainAsset.create({ data: { organizationId: org, fqdn, dnsProvider: "NENHUM" } });
    const dominio = await carregarDominioDoCliente(id, org, fqdn);
    expect(dominio).toMatchObject({ servicoDns: "NENHUM", dns: { registros: [], erro: null } });
    await expect(
      executarOperacaoDns(fqdn, { acao: "apagar", registroId: "mx" }, { id, origem: "CLIENTE" }, { organizationId: org }),
    ).rejects.toMatchObject({ status: 409 });
  }));
});
