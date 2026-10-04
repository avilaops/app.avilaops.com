import { prisma } from "@/lib/prisma";
import { zonaParaBind } from "@/lib/dominios/dns/bind";
import { ErroDeDns, resolverZonaDns, type Ator } from "@/lib/dominios/dns/escrita";
import { lerLinhas, ordenarLinhas, paraLinha } from "@/lib/dominios/dns/versoes";

/**
 * A zona — a de agora, lida do servidor, ou uma versão guardada — como
 * arquivo BIND, com evento de auditoria: exportação na casa sempre deixa
 * rastro, e uma zona exportada diz a quem lê quais serviços o cliente usa.
 */
export async function exportarZonaBind(
  fqdn: string,
  ator: Ator,
  escopo?: { organizationId: string },
  versaoId?: string | null,
): Promise<{ nomeArquivo: string; conteudo: string }> {
  const zona = await resolverZonaDns(fqdn, escopo?.organizationId);
  const agora = new Date();

  let linhas;
  let origem: string;
  if (versaoId) {
    const versao = await prisma.dnsZoneVersion.findFirst({ where: { id: versaoId, domainAssetId: zona.id } });
    if (!versao) throw new ErroDeDns("Versão não encontrada.", 404);
    linhas = lerLinhas(versao.records);
    origem = `Versão de ${versao.createdAt.toISOString()}: ${versao.reason}`;
  } else {
    try {
      linhas = ordenarLinhas((await zona.provedor.listar(zona.zonaId)).map(paraLinha));
    } catch (e) {
      console.error("[dns] falha ao ler a zona para exportar", zona.fqdn, e);
      throw new ErroDeDns("Não foi possível ler a zona agora.", 502);
    }
    origem = "Zona como o servidor respondia no momento da exportação";
  }

  await prisma.operationsAuditEvent.create({
    data: {
      actorId: ator.id,
      organizationId: zona.organizationId,
      action: "DNS_ZONA_EXPORTADA",
      entityType: "DomainAsset",
      entityId: zona.id,
      metadata: { fqdn: zona.fqdn, origem: ator.origem, formato: "BIND", versaoId: versaoId ?? null, registros: linhas.length },
    },
  });

  const sufixo = versaoId ? `-versao-${versaoId.slice(-8)}` : "";
  return {
    nomeArquivo: `${zona.fqdn}${sufixo}.zone`,
    conteudo: zonaParaBind(zona.fqdn, linhas, { geradoEm: agora, origem }),
  };
}
