import BadgeStatus from "@/components/sistema/Status";
import CabecalhoPagina from "@/components/hub-social/CabecalhoPagina";
import SeoAuditPanel from "@/components/SeoAuditPanel";
import AbasLink from "@/components/seo/AbasLink";
import IntegracoesDominio from "@/components/seo/IntegracoesDominio";
import ResumoDominio from "@/components/seo/ResumoDominio";
import {
  connectionData,
  property,
  type Audit,
  type Connection,
  type Params,
  type Performance,
  type SeoItem,
} from "@/components/seo/dados";
import { formatDateTime, nomeProprio } from "@/lib/format";
import { listSitemaps } from "@/lib/search-console";

/** Detalhe de um domínio: cabeçalho com voltar, abas Resumo/Diagnóstico/Integrações. */

export default async function DetalheDominio({
  item,
  params,
  googleConnection,
  auditConnection,
  lighthouseConnection,
  indexNowConnection,
  bingConnection,
  googleError,
  lidoEm,
}: {
  item: SeoItem;
  params: Params;
  googleConnection: Connection;
  auditConnection: Connection;
  lighthouseConnection: Connection;
  indexNowConnection: Connection;
  bingConnection: Connection;
  googleError: string;
  lidoEm: string;
}) {
  const fqdn = item.domain.fqdn;
  const tab = ["summary", "diagnostic", "integrations"].includes(params.tab ?? "") ? params.tab! : "summary";
  const audit = auditConnection?.metadata as Audit | undefined;
  const perf = lighthouseConnection?.metadata as Performance | undefined;
  const priorities = [
    item.issue,
    typeof perf?.performanceScore === "number" && perf.performanceScore < 80
      ? `Melhorar desempenho (${perf.performanceScore}/100)`
      : null,
    audit?.llms?.ok === false ? "Adicionar llms.txt para mecanismos de IA" : null,
  ]
    .filter(Boolean)
    .slice(0, 3) as string[];
  const dates = [auditConnection?.lastSyncedAt, lighthouseConnection?.lastSyncedAt, googleConnection?.lastSyncedAt]
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => b.getTime() - a.getTime());

  let sitemaps: Awaited<ReturnType<typeof listSitemaps>> = [];
  let detailError = googleError;
  if (tab === "integrations" && params.integration === "google") {
    try {
      sitemaps = await listSitemaps(property(fqdn));
    } catch (error) {
      detailError = error instanceof Error ? error.message : "Falha ao consultar o Search Console.";
    }
  }

  const href = (target: string, integration?: string) =>
    `/hub-social/seo?domain=${encodeURIComponent(fqdn)}&tab=${target}${integration ? `&integration=${integration}` : ""}`;

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        voltar={{ href: "/hub-social/seo?view=domains", label: "Domínios" }}
        eyebrow={nomeProprio(item.domain.organization.name)}
        titulo={fqdn}
        meta={
          <span className="flex flex-wrap items-center gap-2">
            {item.issue ? (
              <BadgeStatus status="attention" tom="atencao" texto="Precisa de atenção" titulo={item.issue} />
            ) : (
              <BadgeStatus status="regular" tom="bom" texto="Operação regular" />
            )}
            <span>Atualizado {formatDateTime(dates[0])}</span>
          </span>
        }
      />

      <AbasLink
        rotulo="Seções do domínio"
        ativa={tab}
        abas={[
          { chave: "summary", href: href("summary"), label: "Resumo" },
          { chave: "diagnostic", href: href("diagnostic"), label: "Diagnóstico" },
          { chave: "integrations", href: href("integrations"), label: "Integrações" },
        ]}
      />

      {tab === "summary" ? (
        <ResumoDominio
          audit={audit}
          perf={perf}
          auditConnection={auditConnection}
          lighthouseConnection={lighthouseConnection}
          priorities={priorities}
          hrefDiagnostico={href("diagnostic")}
          lidoEm={lidoEm}
        />
      ) : null}

      {tab === "diagnostic" ? (
        <SeoAuditPanel
          key={fqdn}
          fqdn={fqdn}
          initialSeoConnection={connectionData(auditConnection)}
          initialLighthouseConnection={connectionData(lighthouseConnection)}
        />
      ) : null}

      {tab === "integrations" ? (
        <IntegracoesDominio
          item={item}
          integration={params.integration}
          href={href}
          googleConnection={googleConnection}
          indexNowConnection={indexNowConnection}
          bingConnection={bingConnection}
          sitemaps={sitemaps}
          detailError={detailError}
        />
      ) : null}
    </div>
  );
}
