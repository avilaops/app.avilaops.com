import { prisma } from "@/lib/prisma";
import { JANELA_ATENCAO_DIAS, PROVEDOR_REGISTRO_BR } from "@/lib/dominio-vencimento";
import { diasAte } from "@/lib/registro-br";
import { lerServicoDeDns, provedorDoServico, type ServicoDeDns } from "@/lib/dominios/dns";
import { provedorDeRegistro } from "@/lib/dominios/registry";
import {
  avaliarConsulta,
  avaliarDns,
  avaliarRegistro,
  avaliarRenovacao,
} from "@/lib/dominios/capacidades";
import type { Capacidade, CapacidadesDeEscrita, SituacaoDominio } from "@/lib/dominios/tipos";

/**
 * Monta a central de domínios: a carteira e o estado das quatro funções.
 *
 * O domínio é a entidade. A consulta é por `status`, não por ter zona de DNS
 * em algum fornecedor — antes disso a tela filtrava `cloudflareZoneId != null`
 * e um domínio administrado pela casa sem DNS lá não aparecia no módulo que
 * se chama Domínios.
 */

export type DominioDaCarteira = {
  id: string;
  fqdn: string;
  clienteId: string | null;
  cliente: string;
  situacao: SituacaoDominio;
  expiraEm: string | null;
  diasRestantes: number | null;
  /** Verdadeiro quando alguém, casa ou terceiro, serve o DNS deste domínio. */
  dnsAqui: boolean;
  /** Qual serviço responde pelo DNS: NENHUM, EXTERNO ou AVILA. */
  servicoDns: ServicoDeDns;
  registrosDns: number;
  sincronizadoEm: string | null;
  /** Último veredito da consulta ao registro, quando houve. */
  vereditoRegistro: string | null;
  registroLidoEm: string | null;
  titular: string | null;
  renovacaoAutomatica: boolean;
};

export type ResumoCarteira = {
  total: number;
  ativos: number;
  vencendo: number;
  atencao: number;
  semData: number;
  registrosDns: number;
  /** Quantos domínios já têm o DNS servido pela casa, e quantos ainda não. */
  dnsNaCasa: number;
  dnsExterno: number;
};

export type Central = {
  dominios: DominioDaCarteira[];
  capacidades: Capacidade[];
  escrita: CapacidadesDeEscrita;
  resumo: ResumoCarteira;
  lidoEm: string;
};

/**
 * A situação de um domínio na carteira.
 *
 * "Atenção" é reservado para o que não é só prazo: domínio que o registro diz
 * não existir, ou que nunca teve o vencimento consultado. Misturar isso com
 * "vencendo" esconderia o caso mais grave dentro do mais comum.
 */
export function situacaoDe(
  dominio: { status: string; expiraEm: string | null; vereditoRegistro: string | null },
  agora: Date = new Date(),
): SituacaoDominio {
  if (dominio.status === "ARCHIVED") return "ARQUIVADO";
  if (dominio.vereditoRegistro === "LIVRE") return "ATENCAO";

  const dias = diasAte(dominio.expiraEm, agora);
  if (dias === null) return dominio.vereditoRegistro ? "ATIVO" : "ATENCAO";
  return dias <= JANELA_ATENCAO_DIAS ? "VENCENDO" : "ATIVO";
}

export async function carregarCentral(): Promise<Central> {
  const lidoEm = new Date().toISOString();
  const agora = new Date(lidoEm);

  const registros = await prisma.domainAsset.findMany({
    where: { status: { not: "ARCHIVED" } },
    include: {
      organization: { select: { id: true, name: true } },
      _count: { select: { dnsRecords: true } },
    },
    orderBy: [{ fqdn: "asc" }],
  });

  const leituras = await prisma.integrationConnection.findMany({
    where: { provider: PROVEDOR_REGISTRO_BR, siteUrl: { in: registros.map((r) => r.fqdn) } },
    select: { siteUrl: true, lastSyncedAt: true, metadata: true },
  });
  const porFqdn = new Map(leituras.map((leitura) => [leitura.siteUrl, leitura]));

  const dominios: DominioDaCarteira[] = registros.map((registro) => {
    const leitura = porFqdn.get(registro.fqdn);
    const meta = leitura?.metadata as { titular?: unknown; status?: unknown } | null;
    const veredito = typeof meta?.status === "string" ? meta.status : null;
    const expiraEm = registro.expiresAt?.toISOString() ?? null;

    return {
      id: registro.id,
      fqdn: registro.fqdn,
      clienteId: registro.organization.id,
      cliente: registro.organization.name,
      situacao: situacaoDe({ status: registro.status, expiraEm, vereditoRegistro: veredito }, agora),
      expiraEm,
      diasRestantes: diasAte(expiraEm, agora),
      dnsAqui: lerServicoDeDns(registro.dnsProvider) !== "NENHUM",
      servicoDns: lerServicoDeDns(registro.dnsProvider),
      registrosDns: registro._count.dnsRecords,
      sincronizadoEm: registro.dnsLastSyncedAt?.toISOString() ?? null,
      vereditoRegistro: veredito,
      registroLidoEm: leitura?.lastSyncedAt?.toISOString() ?? null,
      titular: typeof meta?.titular === "string" ? meta.titular : null,
      renovacaoAutomatica: registro.autoRenew,
    };
  });

  const comDns = dominios.filter((d) => d.dnsAqui);
  const naCasa = dominios.filter((d) => d.servicoDns === "AVILA");
  const externos = dominios.filter((d) => d.servicoDns === "EXTERNO");
  const totalRegistrosDns = dominios.reduce((soma, d) => soma + d.registrosDns, 0);
  const comData = dominios.filter((d) => d.expiraEm).length;
  const vencendo = dominios.filter((d) => d.situacao === "VENCENDO").length;
  const vencidos = dominios.filter((d) => (d.diasRestantes ?? 1) < 0).length;
  const atencao = dominios.filter((d) => d.situacao === "ATENCAO").length;

  const sincronizadoEm = dominios.reduce<string | null>(
    (recente, d) => (d.sincronizadoEm && (!recente || d.sincronizadoEm > recente) ? d.sincronizadoEm : recente),
    null,
  );
  const registroLidoEm = dominios.reduce<string | null>(
    (recente, d) => (d.registroLidoEm && (!recente || d.registroLidoEm > recente) ? d.registroLidoEm : recente),
    null,
  );

  const registro = provedorDeRegistro();
  // A luz do DNS olha para quem serve a maior parte da carteira hoje. Durante
  // a migração os dois convivem, e o detalhe da função mostra a divisão.
  const dns = provedorDoServico(naCasa.length > externos.length ? "AVILA" : "EXTERNO");
  const [diagnosticoRegistro, diagnosticoDns] = await Promise.all([
    registro.verificar(),
    dns ? dns.verificar() : Promise.resolve(null),
  ]);
  const permissoes = registro.capacidades();

  const escrita: CapacidadesDeEscrita = {
    registrar: permissoes.registrar && diagnosticoRegistro.operacional,
    renovar: permissoes.renovar && diagnosticoRegistro.operacional,
    transferir: permissoes.transferir && diagnosticoRegistro.operacional,
    editarDns: Boolean(dns?.podeEditar()),
  };

  const capacidades: Capacidade[] = [
    avaliarRegistro(diagnosticoRegistro, escrita),
    avaliarDns({
      provedor: diagnosticoDns ?? undefined,
      naCasa: naCasa.length,
      externos: externos.length,
      dominiosComDns: comDns.length,
      totalRegistros: totalRegistrosDns,
      sincronizadoEm,
      podeEditar: escrita.editarDns,
    }),
    avaliarRenovacao({
      comData,
      total: dominios.length,
      vencendo,
      vencidos,
      verificadoEm: registroLidoEm,
      podeRenovar: escrita.renovar,
    }),
    // A consulta é leitura de dado público e não depende de habilitação.
    // Se a fonte cair, quem descobre é a própria consulta, na hora.
    avaliarConsulta({
      operacional: true,
      verificadoEm: registroLidoEm,
      erro: null,
      fonte: "rdap",
    }),
  ];

  return {
    dominios,
    capacidades,
    escrita,
    resumo: {
      total: dominios.length,
      ativos: dominios.filter((d) => d.situacao === "ATIVO").length,
      vencendo,
      atencao,
      semData: dominios.length - comData,
      registrosDns: totalRegistrosDns,
      dnsNaCasa: naCasa.length,
      dnsExterno: externos.length,
    },
    lidoEm,
  };
}
