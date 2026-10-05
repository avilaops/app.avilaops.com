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

const state = vi.hoisted(() => ({
  tx: null as unknown,
  zona: [] as RegistroDns[],
  chamadas: [] as string[],
  /** Simula o servidor caindo: depois de N escritas, toda chamada falha. */
  caiDepoisDe: null as number | null,
  /** Simula outra pessoa mexendo na zona no meio de uma restauração. */
  aoEscrever: null as null | (() => void),
}));
vi.mock("@/lib/prisma", () => ({ get prisma() { return state.tx; } }));
vi.mock("@/lib/dominios/dns", async (original) => {
  const real = await original<typeof import("@/lib/dominios/dns")>();
  const escrever = () => {
    if (state.caiDepoisDe !== null && state.chamadas.length >= state.caiDepoisDe) throw new Error("timeout");
    state.aoEscrever?.();
    state.aoEscrever = null;
  };
  const falso: DnsProvider = {
    adaptador: "falso",
    configurado: () => true,
    podeEditar: () => true,
    verificar: async () => ({ adaptador: "falso", configurado: true, operacional: true, ambiente: null, verificadoEm: null, erro: null }),
    listar: async () => {
      if (state.caiDepoisDe !== null && state.chamadas.length >= state.caiDepoisDe) throw new Error("timeout");
      return state.zona.map((r) => ({ ...r }));
    },
    criar: async (_zona: string, e: EntradaRegistroDns) => {
      escrever();
      state.chamadas.push(`criar ${e.tipo} ${e.nome}`);
      const novo: RegistroDns = { id: randomUUID(), tipo: e.tipo, nome: e.nome, conteudo: e.conteudo, ttl: e.ttl ?? 1, proxy: false, prioridade: e.prioridade ?? null };
      state.zona.push(novo);
      return novo;
    },
    atualizar: async (_zona: string, id: string, e: EntradaRegistroDns) => {
      escrever();
      state.chamadas.push(`alterar ${id}`);
      const i = state.zona.findIndex((r) => r.id === id);
      state.zona[i] = { ...state.zona[i], tipo: e.tipo, nome: e.nome, conteudo: e.conteudo, ttl: e.ttl ?? state.zona[i].ttl };
      // Como no servidor autoritativo: o TTL é do conjunto (nome + tipo).
      state.zona = state.zona.map((r) => (r.nome === e.nome && r.tipo === e.tipo ? { ...r, ttl: state.zona[i].ttl } : r));
      return state.zona[i];
    },
    remover: async (_zona: string, id: string) => {
      escrever();
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

import { ErroDeDns, executarOperacaoDns, restaurarVersaoDns } from "@/lib/dominios/dns/escrita";
import { exportarZonaBind } from "@/lib/dominios/dns/exportacao";
import { lerLinhas } from "@/lib/dominios/dns/versoes";
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
  state.caiDepoisDe = null;
  state.aoEscrever = null;
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

  it("cada escrita guarda versão, com o retrato de antes na primeira", () => isolado(async ({ tx, id, org, fqdn }) => {
    const cliente = { id, origem: "CLIENTE" as const };
    await executarOperacaoDns(fqdn, { acao: "apagar", registroId: "mx" }, cliente, { organizationId: org });
    await executarOperacaoDns(fqdn, { acao: "criar", entrada: { tipo: "A", nome: "@", conteudo: "203.0.113.10" } }, cliente, { organizationId: org });

    const versoes = await tx.dnsZoneVersion.findMany({ orderBy: { createdAt: "asc" }, where: { domainAsset: { fqdn } } });
    expect(versoes.map((v) => [v.origin, v.recordCount])).toEqual([["SISTEMA", 2], ["CLIENTE", 1], ["CLIENTE", 2]]);
    expect(versoes[1].reason).toBe("Registro MX @ apagado");
  }));

  it("restaurar o retrato inicial devolve o MX apagado e tira o que entrou depois", () => isolado(async ({ tx, id, org, fqdn }) => {
    const cliente = { id, origem: "CLIENTE" as const };
    await executarOperacaoDns(fqdn, { acao: "apagar", registroId: "mx" }, cliente, { organizationId: org });
    await executarOperacaoDns(fqdn, { acao: "criar", entrada: { tipo: "A", nome: "loja", conteudo: "203.0.113.10" } }, cliente, { organizationId: org });
    const inicial = await tx.dnsZoneVersion.findFirstOrThrow({ where: { origin: "SISTEMA", domainAsset: { fqdn } } });

    state.chamadas = [];
    const resultado = await restaurarVersaoDns(fqdn, inicial.id, cliente, { organizationId: org });
    expect(resultado.aplicadas).toBe(2);
    expect(state.chamadas[0]).toMatch(/^apagar /);
    expect(state.chamadas[1]).toBe("criar MX @");
    expect(state.zona.map((r) => r.tipo).sort()).toEqual(["MX", "TXT"]);

    const evento = await tx.operationsAuditEvent.findFirstOrThrow({ where: { organizationId: org, action: "DNS_ZONA_RESTAURADA" } });
    expect(evento.metadata).toMatchObject({ origem: "CLIENTE", versaoId: inicial.id, aplicadas: 2, total: 2 });

    await expect(restaurarVersaoDns(fqdn, inicial.id, cliente, { organizationId: org })).rejects.toMatchObject({ status: 409 });
  }));

  it("versão de outra empresa não é restaurada nem exportada", () => isolado(async ({ tx, id, org, fqdn, outroFqdn }) => {
    const outro = await tx.domainAsset.findUniqueOrThrow({ where: { fqdn: outroFqdn } });
    const alheia = await tx.dnsZoneVersion.create({
      data: { domainAssetId: outro.id, origin: "EQUIPE", reason: "x", records: [], recordCount: 0 },
    });
    const cliente = { id, origem: "CLIENTE" as const };
    await expect(restaurarVersaoDns(fqdn, alheia.id, cliente, { organizationId: org })).rejects.toMatchObject({ status: 404 });
    await expect(restaurarVersaoDns(outroFqdn, alheia.id, cliente, { organizationId: org })).rejects.toMatchObject({ status: 404 });
    await expect(exportarZonaBind(fqdn, cliente, { organizationId: org }, alheia.id)).rejects.toMatchObject({ status: 404 });
    expect(state.chamadas).toEqual([]);
  }));

  it("exportar gera BIND e evento de auditoria", () => isolado(async ({ tx, id, org, fqdn }) => {
    const arquivo = await exportarZonaBind(fqdn, { id, origem: "CLIENTE" }, { organizationId: org });
    expect(arquivo.nomeArquivo).toBe(`${fqdn}.zone`);
    expect(arquivo.conteudo).toContain(`$ORIGIN ${fqdn}.`);
    expect(arquivo.conteudo).toContain("IN\tMX\t10 mx1.provedor.com.");
    expect(await tx.operationsAuditEvent.count({ where: { organizationId: org, action: "DNS_ZONA_EXPORTADA" } })).toBe(1);
  }));

  it("servidor cai no meio da restauração: guarda a zona como ficou, calculada", () => isolado(async ({ tx, id, org, fqdn }) => {
    const cliente = { id, origem: "CLIENTE" as const };
    await executarOperacaoDns(fqdn, { acao: "apagar", registroId: "mx" }, cliente, { organizationId: org });
    await executarOperacaoDns(fqdn, { acao: "criar", entrada: { tipo: "A", nome: "loja", conteudo: "203.0.113.10" } }, cliente, { organizationId: org });
    const inicial = await tx.dnsZoneVersion.findFirstOrThrow({ where: { origin: "SISTEMA", domainAsset: { fqdn } } });

    state.chamadas = [];
    state.caiDepoisDe = 1; // apaga o A loja, cai antes de recriar o MX, e não deixa reler
    await expect(restaurarVersaoDns(fqdn, inicial.id, cliente, { organizationId: org })).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining("guardada como versão"),
    });

    const ultima = await tx.dnsZoneVersion.findFirstOrThrow({ where: { domainAsset: { fqdn } }, orderBy: { createdAt: "desc" } });
    expect(ultima.reason).toMatch(/interrompida \(1 de 2 mudanças confirmadas; estado incerto.*calculada/);
    expect(lerLinhas(ultima.records).map((l) => l.tipo)).toEqual(["TXT"]);
    const evento = await tx.operationsAuditEvent.findFirstOrThrow({ where: { organizationId: org, action: "DNS_ZONA_RESTAURADA_INCOMPLETA" } });
    expect(evento.metadata).toMatchObject({ resultado: "INCOMPLETA", aplicadas: 1, versaoGuardada: true });
  }));

  it("zona alterada por outro no meio da restauração não é anunciada como restaurada", () => isolado(async ({ tx, id, org, fqdn }) => {
    const cliente = { id, origem: "CLIENTE" as const };
    await executarOperacaoDns(fqdn, { acao: "apagar", registroId: "mx" }, cliente, { organizationId: org });
    const inicial = await tx.dnsZoneVersion.findFirstOrThrow({ where: { origin: "SISTEMA", domainAsset: { fqdn } } });

    state.aoEscrever = () => {
      state.zona.push({ id: "intruso", tipo: "TXT", nome: "@", conteudo: "verificacao=xyz", ttl: 1, proxy: false, prioridade: null });
    };
    await expect(restaurarVersaoDns(fqdn, inicial.id, cliente, { organizationId: org })).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("não ficou igual"),
    });
    const evento = await tx.operationsAuditEvent.findFirstOrThrow({ where: { organizationId: org, action: "DNS_ZONA_RESTAURADA_DIVERGENTE" } });
    expect(evento.metadata).toMatchObject({ resultado: "DIVERGENTE" });
  }));

  it("versão guardada continua exportável depois que o DNS saiu daqui", () => isolado(async ({ tx, id, org, fqdn }) => {
    const cliente = { id, origem: "CLIENTE" as const };
    await executarOperacaoDns(fqdn, { acao: "apagar", registroId: "mx" }, cliente, { organizationId: org });
    const versao = await tx.dnsZoneVersion.findFirstOrThrow({ where: { origin: "SISTEMA", domainAsset: { fqdn } } });
    await tx.domainAsset.update({ where: { fqdn }, data: { dnsProvider: "NENHUM" } });

    const arquivo = await exportarZonaBind(fqdn, cliente, { organizationId: org }, versao.id);
    expect(arquivo.conteudo).toContain("IN\tMX\t10 mx1.provedor.com.");
    await expect(exportarZonaBind(fqdn, cliente, { organizationId: org })).rejects.toMatchObject({ status: 409 });
  }));

  it("restauração aplicada mas sem releitura não é anunciada como restaurada", () => isolado(async ({ tx, id, org, fqdn }) => {
    const cliente = { id, origem: "CLIENTE" as const };
    await executarOperacaoDns(fqdn, { acao: "apagar", registroId: "mx" }, cliente, { organizationId: org });
    const inicial = await tx.dnsZoneVersion.findFirstOrThrow({ where: { origin: "SISTEMA", domainAsset: { fqdn } } });

    state.chamadas = [];
    state.caiDepoisDe = 1; // a única mudança (recriar o MX) passa; a releitura cai
    await expect(restaurarVersaoDns(fqdn, inicial.id, cliente, { organizationId: org })).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining("não deixou reler"),
    });
    expect(state.chamadas).toEqual(["criar MX @"]);
    const evento = await tx.operationsAuditEvent.findFirstOrThrow({ where: { organizationId: org, action: "DNS_ZONA_RESTAURADA_NAO_CONFERIDA" } });
    expect(evento.metadata).toMatchObject({ resultado: "NAO_CONFERIDA", aplicadas: 1 });
    expect(await tx.operationsAuditEvent.count({ where: { organizationId: org, action: "DNS_ZONA_RESTAURADA" } })).toBe(0);
  }));

  it("versões continuam na página do domínio depois que o DNS saiu daqui", () => isolado(async ({ tx, id, org, fqdn }) => {
    await executarOperacaoDns(fqdn, { acao: "apagar", registroId: "mx" }, { id, origem: "CLIENTE" }, { organizationId: org });
    await tx.domainAsset.update({ where: { fqdn }, data: { dnsProvider: "NENHUM" } });
    const dominio = await carregarDominioDoCliente(id, org, fqdn);
    expect(dominio?.servicoDns).toBe("NENHUM");
    expect(dominio?.versoes.length).toBe(2);
  }));

  it("falha ao guardar a versão não vira 'não deu para reler': a restauração conferida é sucesso", () => isolado(async ({ tx, id, org, fqdn }) => {
    const cliente = { id, origem: "CLIENTE" as const };
    await executarOperacaoDns(fqdn, { acao: "apagar", registroId: "mx" }, cliente, { organizationId: org });
    const inicial = await tx.dnsZoneVersion.findFirstOrThrow({ where: { origin: "SISTEMA", domainAsset: { fqdn } } });

    const espiao = vi.spyOn(tx.dnsZoneVersion, "create").mockRejectedValueOnce(new Error("banco fora"));
    const resultado = await restaurarVersaoDns(fqdn, inicial.id, cliente, { organizationId: org });
    espiao.mockRestore();
    expect(resultado.aplicadas).toBe(1);
    const evento = await tx.operationsAuditEvent.findFirstOrThrow({ where: { organizationId: org, action: "DNS_ZONA_RESTAURADA" } });
    expect(evento.metadata).toMatchObject({ resultado: "OK", versaoGuardada: false });
  }));

  it("no DNS da casa, o estado calculado leva o TTL novo para o conjunto inteiro", () => isolado(async ({ tx, id, org, fqdn }) => {
    const dominio = await tx.domainAsset.update({ where: { fqdn }, data: { dnsProvider: "AVILA" } });
    state.zona = [
      { id: "mx1", tipo: "MX", nome: fqdn, conteudo: "mx1.provedor.com", ttl: 300, proxy: false, prioridade: 10 },
      { id: "mx2", tipo: "MX", nome: fqdn, conteudo: "mx2.provedor.com", ttl: 300, proxy: false, prioridade: 20 },
    ];
    const linhas = state.zona.map((r) => ({ tipo: r.tipo, nome: r.nome, conteudo: r.conteudo, ttl: 3600, prioridade: r.prioridade, proxy: false }));
    const versao = await tx.dnsZoneVersion.create({ data: { domainAssetId: dominio.id, origin: "EQUIPE", reason: "TTL longo", records: linhas, recordCount: 2 } });

    state.caiDepoisDe = 1; // o primeiro ajuste passa (e leva o conjunto); o segundo e a releitura caem
    await expect(restaurarVersaoDns(fqdn, versao.id, { id, origem: "CLIENTE" }, { organizationId: org })).rejects.toMatchObject({ status: 502 });

    const ultima = await tx.dnsZoneVersion.findFirstOrThrow({ where: { domainAssetId: dominio.id }, orderBy: { createdAt: "desc" } });
    expect(ultima.reason).toMatch(/calculada/);
    expect(lerLinhas(ultima.records).map((l) => l.ttl)).toEqual([3600, 3600]);
  }));

  it("versão guardada de uma restauração divergente não se chama 'Restaurada'", () => isolado(async ({ tx, id, org, fqdn }) => {
    const cliente = { id, origem: "CLIENTE" as const };
    await executarOperacaoDns(fqdn, { acao: "apagar", registroId: "mx" }, cliente, { organizationId: org });
    const inicial = await tx.dnsZoneVersion.findFirstOrThrow({ where: { origin: "SISTEMA", domainAsset: { fqdn } } });
    state.aoEscrever = () => {
      state.zona.push({ id: "intruso", tipo: "TXT", nome: "@", conteudo: "verificacao=xyz", ttl: 1, proxy: false, prioridade: null });
    };
    await expect(restaurarVersaoDns(fqdn, inicial.id, cliente, { organizationId: org })).rejects.toMatchObject({ status: 409 });
    const ultima = await tx.dnsZoneVersion.findFirstOrThrow({ where: { domainAsset: { fqdn } }, orderBy: { createdAt: "desc" } });
    expect(ultima.reason).toMatch(/não conferiu/);
    expect(ultima.reason).not.toMatch(/^Restaurada/);
  }));

  it("falha ao limpar o espelho no banco não interrompe a restauração", () => isolado(async ({ tx, id, org, fqdn }) => {
    const cliente = { id, origem: "CLIENTE" as const };
    await executarOperacaoDns(fqdn, { acao: "criar", entrada: { tipo: "A", nome: "loja", conteudo: "203.0.113.10" } }, cliente, { organizationId: org });
    await executarOperacaoDns(fqdn, { acao: "criar", entrada: { tipo: "A", nome: "blog", conteudo: "203.0.113.11" } }, cliente, { organizationId: org });
    const inicial = await tx.dnsZoneVersion.findFirstOrThrow({ where: { origin: "SISTEMA", domainAsset: { fqdn } } });

    const espiao = vi.spyOn(tx.dnsRecord, "deleteMany").mockRejectedValue(new Error("banco fora"));
    const resultado = await restaurarVersaoDns(fqdn, inicial.id, cliente, { organizationId: org });
    espiao.mockRestore();
    expect(resultado.aplicadas).toBe(2);
    expect(state.zona.map((r) => r.tipo).sort()).toEqual(["MX", "TXT"]);
  }));

  it("apagar registro não vira 'recusado' só porque o espelho falhou", () => isolado(async ({ tx, id, org, fqdn }) => {
    const espiao = vi.spyOn(tx.dnsRecord, "deleteMany").mockRejectedValue(new Error("banco fora"));
    await executarOperacaoDns(fqdn, { acao: "apagar", registroId: "mx" }, { id, origem: "CLIENTE" }, { organizationId: org });
    espiao.mockRestore();
    expect(state.zona.map((r) => r.id)).toEqual(["spf"]);
    expect(await tx.operationsAuditEvent.count({ where: { organizationId: org, action: "DNS_REGISTRO_APAGADO" } })).toBe(1);
  }));

  it("versão com TXT que o serviço atual não aceita é recusada antes de apagar qualquer coisa", () => isolado(async ({ tx, id, org, fqdn }) => {
    const dominio = await tx.domainAsset.findUniqueOrThrow({ where: { fqdn } });
    const versao = await tx.dnsZoneVersion.create({
      data: {
        domainAssetId: dominio.id,
        origin: "EQUIPE",
        reason: "veio do DNS da casa",
        records: { formato: 2, linhas: [{ tipo: "TXT", nome: fqdn, conteudo: '"a\\255b"', ttl: 1, prioridade: null, proxy: false }] },
        recordCount: 1,
      },
    });
    await expect(restaurarVersaoDns(fqdn, versao.id, { id, origem: "CLIENTE" }, { organizationId: org })).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining("Nada foi alterado"),
    });
    expect(state.chamadas).toEqual([]);
    expect(state.zona.map((r) => r.id)).toEqual(["spf", "mx"]);
  }));

  it("SOA e NS do próprio domínio não são alterados pelo painel", () => isolado(async ({ id, org, fqdn }) => {
    state.zona.push({ id: "ns-apex", tipo: "NS", nome: fqdn, conteudo: "ns1.avilaops.com", ttl: 3600, proxy: false, prioridade: null });
    await expect(
      executarOperacaoDns(fqdn, { acao: "apagar", registroId: "ns-apex" }, { id, origem: "CLIENTE" }, { organizationId: org }),
    ).rejects.toMatchObject({ status: 403 });
    expect(state.chamadas).toEqual([]);
  }));

  it("versão com proxy não é restaurada no DNS da casa, e nada é apagado antes", () => isolado(async ({ tx, id, org, fqdn }) => {
    const dominio = await tx.domainAsset.update({ where: { fqdn }, data: { dnsProvider: "AVILA" } });
    const versao = await tx.dnsZoneVersion.create({
      data: {
        domainAssetId: dominio.id,
        origin: "EQUIPE",
        reason: "veio do serviço externo",
        records: { formato: 2, linhas: [{ tipo: "A", nome: fqdn, conteudo: "203.0.113.10", ttl: 1, prioridade: null, proxy: true }] },
        recordCount: 1,
      },
    });
    await expect(restaurarVersaoDns(fqdn, versao.id, { id, origem: "CLIENTE" }, { organizationId: org })).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining("proxy"),
    });
    expect(state.chamadas).toEqual([]);
  }));
});

