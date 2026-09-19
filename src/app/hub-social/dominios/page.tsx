import { redirect } from "next/navigation";
import CabecalhoPagina from "@/components/hub-social/CabecalhoPagina";
import AcoesDominios from "@/components/dominios/AcoesDominios";
import AssistenteRegistro from "@/components/dominios/AssistenteRegistro";
import ConsultaDominio from "@/components/dominios/ConsultaDominio";
import DetalheCapacidade from "@/components/dominios/DetalheCapacidade";
import DetalheDominio from "@/components/dominios/DetalheDominio";
import VisaoGeralDominios from "@/components/dominios/VisaoGeralDominios";
import { BASE, hrefRegistrar, lerFiltro, type Params } from "@/components/dominios/dados";
import { getAdmin } from "@/lib/auth";
import { carregarCentral } from "@/lib/dominios/central";
import { provedorDeDns, type RegistroDns } from "@/lib/dominios/dns";
import { prisma } from "@/lib/prisma";
import type { ChaveCapacidade } from "@/lib/dominios/tipos";

export const metadata = {
  title: "Domínios | Hub Social",
  description: "Registro, DNS e renovação dos domínios sob gestão da Ávila Ops.",
};

const CHAVES: ChaveCapacidade[] = ["registro", "dns", "renovacao", "consulta"];

/**
 * A central de domínios.
 *
 * Uma rota só, com as vistas escolhidas por parâmetro, como já fazem SEO e
 * Ícones: sem segunda barra de abas dentro de uma tela que já vive sob a
 * navegação do Hub Social.
 */
export default async function DominiosPage({ searchParams }: { searchParams: Promise<Params> }) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const params = await searchParams;
  const central = await carregarCentral();

  if (params.registrar) {
    const clientes = await prisma.organization.findMany({
      where: { status: { not: "CHURNED" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return (
      <AssistenteRegistro
        clientes={clientes.map((c) => ({ organizationId: c.id, nome: c.name }))}
        podeRegistrar={central.escrita.registrar}
        dominioInicial={typeof params.domain === "string" ? params.domain : ""}
      />
    );
  }

  if (params.consultar) {
    return (
      <div className="space-y-6">
        <CabecalhoPagina
          eyebrow="Domínios"
          titulo="Consultar domínio"
          subtitulo="Veja se um domínio está livre antes de oferecer ao cliente."
          voltar={{ href: BASE, label: "Domínios" }}
        />
        <ConsultaDominio hrefRegistrar={central.escrita.registrar ? hrefRegistrar : null} />
      </div>
    );
  }

  const chave = CHAVES.find((item) => item === params.funcao);
  if (chave) {
    const capacidade = central.capacidades.find((item) => item.chave === chave);
    if (capacidade) return <DetalheCapacidade capacidade={capacidade} dominios={central.dominios} />;
  }

  if (params.domain) {
    const dominio = central.dominios.find((item) => item.fqdn === params.domain);
    if (dominio) {
      let registros: RegistroDns[] = [];
      let erroDns: string | null = null;

      if (dominio.dnsAqui) {
        // A zona é lida ao vivo: a tela de um domínio é onde alguém vai mexer,
        // e mexer no espelho de uma hora atrás é como se edita por engano.
        const zona = await prisma.domainAsset.findUnique({
          where: { fqdn: dominio.fqdn },
          select: { cloudflareZoneId: true },
        });
        if (zona?.cloudflareZoneId) {
          try {
            registros = await provedorDeDns().listar(zona.cloudflareZoneId);
          } catch (e) {
            erroDns = e instanceof Error ? e.message : "Não foi possível ler os registros de DNS agora.";
          }
        }
      }

      const eventos = await prisma.operationsAuditEvent.findMany({
        where: { entityType: "DomainAsset", entityId: dominio.id },
        orderBy: { createdAt: "desc" },
        take: 15,
        select: { createdAt: true, action: true, actorId: true, metadata: true },
      });

      return (
        <DetalheDominio
          dominio={dominio}
          registros={registros}
          erroDns={erroDns}
          escrita={central.escrita}
          historico={eventos.map((evento) => ({
            quando: evento.createdAt.toISOString(),
            acao: rotuloDaAcao(evento.action),
            quem: evento.actorId,
            resultado: null,
          }))}
        />
      );
    }
  }

  return (
    <>
      <CabecalhoPagina
        eyebrow="Hub Social"
        titulo="Domínios"
        subtitulo="Registro, DNS e renovação"
        acoes={<AcoesDominios podeRegistrar={central.escrita.registrar} />}
      />
      <VisaoGeralDominios
        dominios={central.dominios}
        capacidades={central.capacidades}
        resumo={central.resumo}
        lidoEm={central.lidoEm}
        filtroInicial={lerFiltro(params.filtro)}
      />
    </>
  );
}

/** O código interno da auditoria vira frase. O cru fica no banco. */
function rotuloDaAcao(acao: string): string {
  const mapa: Record<string, string> = {
    DNS_REGISTRO_CRIADO: "Registro de DNS criado",
    DNS_REGISTRO_ALTERADO: "Registro de DNS alterado",
    DNS_REGISTRO_APAGADO: "Registro de DNS apagado",
    CLOUDFLARE_DOMAINS_SYNCED: "DNS sincronizado",
    REGISTRO_BR_VENCIMENTOS_SINCRONIZADOS: "Vencimentos consultados",
  };
  return mapa[acao] ?? acao;
}
