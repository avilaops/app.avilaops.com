import { PROVEDOR_REGISTRO_BR } from "@/lib/dominio-vencimento";
import { situacaoDe } from "@/lib/dominios/central";
import { lerServicoDeDns, provedorDeDnsDoDominio, type RegistroDns, type ServicoDeDns } from "@/lib/dominios/dns";
import type { SituacaoDominio } from "@/lib/dominios/tipos";
import { nomesDosAtores } from "@/lib/atores";
import { listarVersoes, retencaoDeVersoes } from "@/lib/dominios/dns/escrita";
import type { LinhaVersao } from "@/lib/dominios/dns/versoes";
import { participaDaEmpresa } from "@/lib/nucleo/acesso";
import { prisma } from "@/lib/prisma";
import { diasAte } from "@/lib/registro-br";

/**
 * Um domínio visto pelo cliente: vencimento com a fonte, a zona de DNS lida
 * ao vivo e o que foi feito nela.
 *
 * Mesma regra de `portal-cliente.ts`: a empresa vem da sessão e o domínio de
 * outra empresa não existe para quem pergunta. Não entra fornecedor, id de
 * zona nem anotação da equipe.
 */
export type DominioDoCliente = {
  id: string;
  fqdn: string;
  situacao: SituacaoDominio;
  expiraEm: string | null;
  diasRestantes: number | null;
  renovacaoAutomatica: boolean;
  /** De onde veio o vencimento e quando foi lido. Sem fonte, a tela diz isso. */
  vencimento: { fonte: "registro" | "cadastro"; lidoEm: string | null };
  /** Verdadeiro quando o registro respondeu que o domínio não existe. */
  semRegistro: boolean;
  servicoDns: ServicoDeDns;
  dns: { registros: RegistroDns[]; lidoEm: string | null; erro: string | null };
  historico: Array<{ quando: string; acao: string; quem: string; resumo: string | null }>;
  versoes: Array<{ id: string; criadaEm: string; quem: string; motivo: string; linhas: LinhaVersao[] }>;
  /** Dias de guarda de cada versão, da camada de parâmetros; nulo enquanto não confirmado. */
  retencaoVersoesDias: number | null;
};

const ROTULO_ACAO: Record<string, string> = {
  DNS_REGISTRO_CRIADO: "Registro de DNS criado",
  DNS_REGISTRO_ALTERADO: "Registro de DNS alterado",
  DNS_REGISTRO_APAGADO: "Registro de DNS apagado",
  DNS_REGISTRO_CRIADO_FALHOU: "Tentativa de criar registro recusada pelo DNS",
  DNS_REGISTRO_ALTERADO_FALHOU: "Tentativa de alterar registro recusada pelo DNS",
  DNS_REGISTRO_APAGADO_FALHOU: "Tentativa de apagar registro recusada pelo DNS",
  DNS_ZONA_RESTAURADA: "Zona restaurada a uma versão anterior",
  DNS_ZONA_RESTAURADA_INCOMPLETA: "Restauração de versão interrompida",
  DNS_ZONA_RESTAURADA_NAO_CONFERIDA: "Restauração aplicada, sem conferência da zona",
  DNS_ZONA_RESTAURADA_DIVERGENTE: "Restauração aplicada, mas a zona mudou no meio",
  DNS_ZONA_EXPORTADA: "Zona exportada em BIND",
};

type Resumivel = { tipo?: unknown; nome?: unknown; conteudo?: unknown } | null | undefined;

function resumir(registro: Resumivel): string | null {
  if (!registro || typeof registro.tipo !== "string" || typeof registro.nome !== "string") return null;
  return `${registro.tipo} ${registro.nome}${typeof registro.conteudo === "string" ? ` → ${registro.conteudo}` : ""}`;
}

export async function carregarDominioDoCliente(
  identityId: string,
  organizationId: string,
  fqdn: string,
): Promise<DominioDoCliente | null> {
  if (!(await participaDaEmpresa(identityId, organizationId))) return null;

  const dominio = await prisma.domainAsset.findFirst({
    where: { fqdn: fqdn.toLowerCase(), organizationId, status: { not: "ARCHIVED" } },
    select: { id: true, fqdn: true, status: true, expiresAt: true, autoRenew: true, dnsProvider: true, cloudflareZoneId: true },
  });
  if (!dominio) return null;

  const agora = new Date();
  const leitura = await prisma.integrationConnection.findFirst({
    where: { provider: PROVEDOR_REGISTRO_BR, siteUrl: dominio.fqdn },
    select: { lastSyncedAt: true, metadata: true },
  });
  const veredito = typeof (leitura?.metadata as { status?: unknown } | null)?.status === "string"
    ? ((leitura!.metadata as { status: string }).status)
    : null;
  const expiraEm = dominio.expiresAt?.toISOString() ?? null;

  const servicoDns = lerServicoDeDns(dominio.dnsProvider);
  const dns: DominioDoCliente["dns"] = { registros: [], lidoEm: null, erro: null };
  const provedor = provedorDeDnsDoDominio(dominio);
  if (provedor) {
    const zonaId = servicoDns === "AVILA" ? dominio.fqdn : dominio.cloudflareZoneId;
    if (!provedor.configurado() || !zonaId) {
      dns.erro = "A zona não pode ser lida agora. Nada mudou nela; tente de novo em alguns minutos.";
    } else {
      try {
        // Ao vivo, não do espelho: esta é a tela onde o cliente vai mexer.
        dns.registros = await provedor.listar(zonaId);
        dns.lidoEm = new Date().toISOString();
      } catch (e) {
        console.error("[portal] falha ao ler DNS de", dominio.fqdn, e);
        dns.erro = "O serviço de DNS não respondeu agora. Nada mudou na zona; tente de novo em alguns minutos.";
      }
    }
  }

  const eventos = await prisma.operationsAuditEvent.findMany({
    where: { entityType: "DomainAsset", entityId: dominio.id, action: { in: Object.keys(ROTULO_ACAO) } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { createdAt: true, action: true, actorId: true, metadata: true },
  });
  const versoes = await listarVersoes(dominio.id);
  const retencaoVersoesDias = await retencaoDeVersoes(dominio.fqdn);
  // Nome só de quem é da própria empresa. Gente da casa aparece como equipe.
  const nome = await nomesDosAtores([...eventos.map((e) => e.actorId), ...versoes.map((v) => v.quem)], {
    mascararCasa: true,
  });

  return {
    id: dominio.id,
    fqdn: dominio.fqdn,
    situacao: situacaoDe({ status: dominio.status, expiraEm, vereditoRegistro: veredito }, agora),
    expiraEm,
    diasRestantes: diasAte(expiraEm, agora),
    renovacaoAutomatica: dominio.autoRenew,
    vencimento: leitura?.lastSyncedAt
      ? { fonte: "registro", lidoEm: leitura.lastSyncedAt.toISOString() }
      : { fonte: "cadastro", lidoEm: null },
    semRegistro: veredito === "LIVRE",
    servicoDns,
    dns,
    historico: eventos.map((evento) => {
      const meta = evento.metadata as { antes?: Resumivel; depois?: Resumivel; pedido?: Resumivel } | null;
      return {
        quando: evento.createdAt.toISOString(),
        acao: ROTULO_ACAO[evento.action] ?? "Alteração de DNS",
        quem: nome(evento.actorId),
        resumo: resumir(meta?.depois) ?? resumir(meta?.antes) ?? resumir(meta?.pedido),
      };
    }),
    versoes: versoes.map((v) => ({
      id: v.id,
      criadaEm: v.criadaEm,
      quem: v.origem === "SISTEMA" ? "registro automático" : nome(v.quem),
      motivo: v.motivo,
      linhas: v.linhas,
    })),
    retencaoVersoesDias,
  };
}
