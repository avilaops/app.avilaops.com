import { redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import BingWebmasterPanel from "@/components/BingWebmasterPanel";
import IndexNowPanel from "@/components/IndexNowPanel";
import SearchConsolePanel from "@/components/SearchConsolePanel";
import SeoAuditPanel from "@/components/SeoAuditPanel";
import { getAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { listSitemaps, listVerifiedSites } from "@/lib/search-console";

const PROVIDER = "google_search_console";
const INDEXNOW_PROVIDER = "indexnow";
const SEO_AUDIT_PROVIDER = "seo_audit";
const LIGHTHOUSE_PROVIDER = "lighthouse";
const BING_WEBMASTER_PROVIDER = "bing_webmaster";

function domainProperty(fqdn: string) {
  return `sc-domain:${fqdn}`;
}

function sitemapUrl(fqdn: string) {
  return `https://${fqdn}/sitemap.xml`;
}

function sitemapAudit(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const audit = (metadata as { sitemapAudit?: unknown }).sitemapAudit;
  if (!audit || typeof audit !== "object" || Array.isArray(audit)) return null;
  return audit as {
    ok?: boolean;
    status?: number | null;
    urlCount?: number;
    checkedAt?: string;
  };
}

export default async function SeoIntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string }>;
}) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const params = await searchParams;
  const domains = await prisma.domainAsset.findMany({
    where: { status: { not: "ARCHIVED" } },
    include: {
      organization: { select: { name: true, siteUrl: true, status: true } },
      _count: { select: { dnsRecords: true } },
    },
    orderBy: { fqdn: "asc" },
  });
  const selectedDomain =
    domains.find((domain) => domain.fqdn === params.domain) ??
    domains.find((domain) => domain.fqdn === "avilaops.com") ??
    // Fallback para o domínio antigo enquanto a migração de dados do
    // DomainAsset não tiver rodado — sem isto a tela cai no primeiro
    // domínio da lista, que é de cliente, não nosso.
    domains.find((domain) => domain.fqdn === "avila.inc") ??
    domains[0] ??
    null;
  const selectedSiteUrl = selectedDomain ? domainProperty(selectedDomain.fqdn) : "";
  const selectedSitemapUrl = selectedDomain ? sitemapUrl(selectedDomain.fqdn) : "";

  const connections = await prisma.integrationConnection.findMany({
    where: {
      provider: {
        in: [PROVIDER, INDEXNOW_PROVIDER, SEO_AUDIT_PROVIDER, LIGHTHOUSE_PROVIDER, BING_WEBMASTER_PROVIDER],
      },
    },
    orderBy: { updatedAt: "desc" },
  });
  const connectionBySiteUrl = new Map(
    connections
      .filter((connection) => connection.provider === PROVIDER)
      .map((connection) => [connection.siteUrl, connection]),
  );
  const indexNowConnectionByFqdn = new Map(
    connections
      .filter((connection) => connection.provider === INDEXNOW_PROVIDER)
      .map((connection) => [connection.siteUrl, connection]),
  );
  const seoAuditConnectionByFqdn = new Map(
    connections
      .filter((connection) => connection.provider === SEO_AUDIT_PROVIDER)
      .map((connection) => [connection.siteUrl, connection]),
  );
  const lighthouseConnectionByFqdn = new Map(
    connections
      .filter((connection) => connection.provider === LIGHTHOUSE_PROVIDER)
      .map((connection) => [connection.siteUrl, connection]),
  );
  const bingConnectionByFqdn = new Map(
    connections
      .filter((connection) => connection.provider === BING_WEBMASTER_PROVIDER)
      .map((connection) => [connection.siteUrl, connection]),
  );

  const connection = selectedSiteUrl
    ? connectionBySiteUrl.get(selectedSiteUrl) ?? null
    : null;

  let sitemaps: Awaited<ReturnType<typeof listSitemaps>> = [];
  let verifiedSites: Awaited<ReturnType<typeof listVerifiedSites>> = [];
  let error: string | undefined;

  try {
    verifiedSites = await listVerifiedSites();
    if (selectedSiteUrl) {
      sitemaps = await listSitemaps(selectedSiteUrl);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "Falha ao consultar o Search Console.";
  }
  const verifiedSiteUrls = new Set(verifiedSites.map((site) => site.siteUrl).filter(Boolean));
  const gscConnectedCount = domains.filter((domain) =>
    connectionBySiteUrl.has(domainProperty(domain.fqdn)),
  ).length;
  const gscVerifiedCount = domains.filter((domain) =>
    verifiedSiteUrls.has(domainProperty(domain.fqdn)),
  ).length;

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="seo">
      <header className="page-header operations-header">
        <div>
          <h1>SEO</h1>
          <p>Domínios, DNS, Search Console e sitemap por cliente.</p>
        </div>
      </header>

      <section className="operations-metrics">
        <article className="operations-metric operations-metric-primary">
          <span>Empresas</span>
          <strong>{new Set(domains.map((domain) => domain.organization.name)).size}</strong>
        </article>
        <article className="operations-metric">
          <span>Domínios</span>
          <strong>{domains.length}</strong>
        </article>
        <article className="operations-metric">
          <span>Search Console</span>
          <strong>
            {gscConnectedCount}/{domains.length}
          </strong>
        </article>
        <article className="operations-metric">
          <span>Verificados pela API</span>
          <strong>
            {gscVerifiedCount}/{domains.length}
          </strong>
        </article>
      </section>

      <section className="operations-panel clients-panel">
        <div className="operations-panel-heading">
          <div>
            <h2>Status SEO operacional</h2>
          </div>
          <small>Base atual do Postgres de produção</small>
        </div>

        {domains.length === 0 ? (
          <div className="operations-empty clients-empty">
            <span className="empty-index">00</span>
            <strong>Nenhum domínio cadastrado.</strong>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Domínio</th>
                  <th>DNS</th>
                  <th>Search Console</th>
                  <th>IndexNow</th>
                  <th>Sitemap</th>
                  <th>Última sync DNS</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {domains.map((domain) => {
                  const siteUrl = domainProperty(domain.fqdn);
                  const domainConnection = connectionBySiteUrl.get(siteUrl);
                  const indexNowConnection = indexNowConnectionByFqdn.get(domain.fqdn);
                  const isVerified = verifiedSiteUrls.has(siteUrl);
                  const audit = sitemapAudit(domainConnection?.metadata);

                  return (
                    <tr key={domain.id}>
                      <td>{domain.organization.name}</td>
                      <td>{domain.fqdn}</td>
                      <td>
                        {domain.cloudflareStatus ?? domain.status} · {domain._count.dnsRecords} registros
                      </td>
                      <td>
                        {isVerified
                          ? "Verificado"
                          : domainConnection?.lastSyncStatus === "SUCCESS"
                            ? "Sitemap enviado"
                            : "Não conectado"}
                      </td>
                      <td>{indexNowConnection?.lastSyncStatus ?? "Não enviado"}</td>
                      <td>
                        {audit
                          ? `${audit.ok ? "OK" : "Erro"} · HTTP ${audit.status ?? "—"} · ${
                              audit.urlCount ?? 0
                            } URLs`
                          : sitemapUrl(domain.fqdn)}
                      </td>
                      <td>{formatDateTime(domain.dnsLastSyncedAt)}</td>
                      <td>
                        <Link className="inline-action" href={`/operacao/seo?domain=${domain.fqdn}`}>
                          Abrir
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="operations-grid">
        {selectedDomain ? (
          <>
            <SeoAuditPanel
              fqdn={selectedDomain.fqdn}
              initialSeoConnection={
                seoAuditConnectionByFqdn.get(selectedDomain.fqdn)
                  ? {
                      id: seoAuditConnectionByFqdn.get(selectedDomain.fqdn)!.id,
                      status: seoAuditConnectionByFqdn.get(selectedDomain.fqdn)!.status,
                      lastSyncedAt:
                        seoAuditConnectionByFqdn
                          .get(selectedDomain.fqdn)!
                          .lastSyncedAt?.toISOString() ?? null,
                      lastSyncStatus:
                        seoAuditConnectionByFqdn.get(selectedDomain.fqdn)!.lastSyncStatus,
                      lastSyncError:
                        seoAuditConnectionByFqdn.get(selectedDomain.fqdn)!.lastSyncError,
                      metadata: seoAuditConnectionByFqdn.get(selectedDomain.fqdn)!.metadata,
                    }
                  : null
              }
              initialLighthouseConnection={
                lighthouseConnectionByFqdn.get(selectedDomain.fqdn)
                  ? {
                      id: lighthouseConnectionByFqdn.get(selectedDomain.fqdn)!.id,
                      status: lighthouseConnectionByFqdn.get(selectedDomain.fqdn)!.status,
                      lastSyncedAt:
                        lighthouseConnectionByFqdn
                          .get(selectedDomain.fqdn)!
                          .lastSyncedAt?.toISOString() ?? null,
                      lastSyncStatus:
                        lighthouseConnectionByFqdn.get(selectedDomain.fqdn)!.lastSyncStatus,
                      lastSyncError:
                        lighthouseConnectionByFqdn.get(selectedDomain.fqdn)!.lastSyncError,
                      metadata: lighthouseConnectionByFqdn.get(selectedDomain.fqdn)!.metadata,
                    }
                  : null
              }
            />
            <SearchConsolePanel
              siteUrl={selectedSiteUrl}
              sitemapUrl={selectedSitemapUrl}
              initialConnection={
                connection
                  ? {
                      id: connection.id,
                      status: connection.status,
                      lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
                      lastSyncStatus: connection.lastSyncStatus,
                      lastSyncError: connection.lastSyncError,
                      metadata: connection.metadata,
                    }
                  : null
              }
              initialSitemaps={sitemaps}
              initialError={error}
            />
            <IndexNowPanel
              fqdn={selectedDomain.fqdn}
              initialConnection={
                indexNowConnectionByFqdn.get(selectedDomain.fqdn)
                  ? {
                      id: indexNowConnectionByFqdn.get(selectedDomain.fqdn)!.id,
                      status: indexNowConnectionByFqdn.get(selectedDomain.fqdn)!.status,
                      lastSyncedAt:
                        indexNowConnectionByFqdn
                          .get(selectedDomain.fqdn)!
                          .lastSyncedAt?.toISOString() ?? null,
                      lastSyncStatus:
                        indexNowConnectionByFqdn.get(selectedDomain.fqdn)!.lastSyncStatus,
                      lastSyncError:
                        indexNowConnectionByFqdn.get(selectedDomain.fqdn)!.lastSyncError,
                      metadata: indexNowConnectionByFqdn.get(selectedDomain.fqdn)!.metadata,
                    }
                  : null
              }
            />
            <BingWebmasterPanel
              fqdn={selectedDomain.fqdn}
              initialConnection={
                bingConnectionByFqdn.get(selectedDomain.fqdn)
                  ? {
                      id: bingConnectionByFqdn.get(selectedDomain.fqdn)!.id,
                      status: bingConnectionByFqdn.get(selectedDomain.fqdn)!.status,
                      lastSyncedAt:
                        bingConnectionByFqdn
                          .get(selectedDomain.fqdn)!
                          .lastSyncedAt?.toISOString() ?? null,
                      lastSyncStatus:
                        bingConnectionByFqdn.get(selectedDomain.fqdn)!.lastSyncStatus,
                      lastSyncError:
                        bingConnectionByFqdn.get(selectedDomain.fqdn)!.lastSyncError,
                      metadata: bingConnectionByFqdn.get(selectedDomain.fqdn)!.metadata,
                    }
                  : null
              }
            />
          </>
        ) : null}
      </section>
    </AppShell>
  );
}

