import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import BingWebmasterPanel from "@/components/BingWebmasterPanel";
import IndexNowPanel from "@/components/IndexNowPanel";
import SearchConsolePanel from "@/components/SearchConsolePanel";
import SeoAuditPanel from "@/components/SeoAuditPanel";
import { getAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { listSitemaps, listVerifiedSites } from "@/lib/search-console";

const P = { google: "google_search_console", indexnow: "indexnow", audit: "seo_audit", lighthouse: "lighthouse", bing: "bing_webmaster" } as const;
const PAGE_SIZE = 10;
type Params = { view?: string; domain?: string; tab?: string; integration?: string; q?: string; status?: string; page?: string };
type Audit = { score?: number; robots?: { ok?: boolean }; sitemap?: { ok?: boolean }; llms?: { ok?: boolean }; homeHtml?: { hasCanonical?: boolean } };
type Performance = { performanceScore?: number; lcp?: string; cls?: string; inp?: string };
type Connection = Awaited<ReturnType<typeof prisma.integrationConnection.findFirst>>;
type SeoItem = {
  domain: {
    id: string;
    organizationId: string;
    fqdn: string;
    status: string;
    cloudflareStatus: string | null;
    organization: { name: string };
    _count: { dnsRecords: number };
  };
  connected: boolean;
  verified: boolean;
  audit: Audit | undefined;
  issue: string | null;
};

const property = (fqdn: string) => `sc-domain:${fqdn}`;
const sitemap = (fqdn: string) => `https://${fqdn}/sitemap.xml`;
const connectionData = (connection: Connection) => connection ? ({ id: connection.id, status: connection.status, lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null, lastSyncStatus: connection.lastSyncStatus, lastSyncError: connection.lastSyncError, metadata: connection.metadata }) : null;

function issueFor(connected: boolean, verified: boolean, audit?: Audit) {
  if (!connected) return "Conectar ao Google Search Console";
  if (!verified) return "Verificar a propriedade no Google";
  if (!audit) return "Executar a primeira auditoria técnica";
  if (audit.robots?.ok === false) return "Corrigir o arquivo robots.txt";
  if (audit.sitemap?.ok === false) return "Publicar um sitemap válido";
  if (audit.homeHtml?.hasCanonical === false) return "Configurar a URL canônica";
  if ((audit.score ?? 100) < 75) return `Melhorar o score técnico (${audit.score}/100)`;
  return null;
}

export default async function SeoPage({ searchParams }: { searchParams: Promise<Params> }) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  const params = await searchParams;
  const domains = await prisma.domainAsset.findMany({ where: { status: { not: "ARCHIVED" } }, include: { organization: { select: { name: true } }, _count: { select: { dnsRecords: true } } }, orderBy: [{ organization: { name: "asc" } }, { fqdn: "asc" }] });
  const connections = await prisma.integrationConnection.findMany({ where: { provider: { in: Object.values(P) } }, orderBy: { updatedAt: "desc" } });
  const mapFor = (provider: string) => new Map(connections.filter((item) => item.provider === provider).map((item) => [item.siteUrl, item]));
  const google = mapFor(P.google), audits = mapFor(P.audit), lighthouse = mapFor(P.lighthouse), indexnow = mapFor(P.indexnow), bing = mapFor(P.bing);
  let verified = new Set<string>();
  let googleError = "";
  try { verified = new Set((await listVerifiedSites()).map((site) => site.siteUrl).filter((url): url is string => Boolean(url))); }
  catch (error) { googleError = error instanceof Error ? error.message : "Não foi possível consultar o Google Search Console."; }
  const items = domains.map((domain) => {
    const connected = google.has(property(domain.fqdn));
    const isVerified = verified.has(property(domain.fqdn));
    const audit = audits.get(domain.fqdn)?.metadata as Audit | undefined;
    return { domain, connected, verified: isVerified, audit, issue: issueFor(connected, isVerified, audit) };
  });
  const selected = items.find((item) => item.domain.fqdn === params.domain);
  const view = params.view === "domains" ? "domains" : "overview";
  return <AppShell adminName={admin.nome} papel={admin.role} section="seo">
    {!selected ? <>
      <header className="seo-page-header"><div><span className="eyebrow">CRESCIMENTO ORGÂNICO</span><h1>SEO</h1><p>Visibilidade e saúde de busca de todos os clientes.</p></div><small>Atualizado agora</small></header>
      <nav className="seo-local-nav" aria-label="Navegação de SEO"><Link href="/operacao/seo" aria-current={view === "overview" ? "page" : undefined}>Visão geral</Link><Link href="/operacao/seo?view=domains" aria-current={view === "domains" ? "page" : undefined}>Domínios</Link></nav>
      {view === "overview" ? <Overview items={items} domainCount={domains.length} companyCount={new Set(domains.map((d) => d.organizationId)).size} connectedCount={items.filter((i) => i.connected).length} verifiedCount={items.filter((i) => i.verified).length} googleError={googleError} /> : <Directory items={items} params={params} />}
    </> : <Detail item={selected} params={params} googleConnection={google.get(property(selected.domain.fqdn)) ?? null} auditConnection={audits.get(selected.domain.fqdn) ?? null} lighthouseConnection={lighthouse.get(selected.domain.fqdn) ?? null} indexNowConnection={indexnow.get(selected.domain.fqdn) ?? null} bingConnection={bing.get(selected.domain.fqdn) ?? null} googleError={googleError} />}
  </AppShell>;
}

function Overview({ items, domainCount, companyCount, connectedCount, verifiedCount, googleError }: { items: SeoItem[]; domainCount: number; companyCount: number; connectedCount: number; verifiedCount: number; googleError: string }) {
  const attention = items.filter((item) => item.issue).slice(0, 5);
  return <><section className="seo-kpis" aria-label="Resumo de SEO"><div><span>Empresas acompanhadas</span><strong>{companyCount}</strong></div><div><span>Domínios ativos</span><strong>{domainCount}</strong></div><div><span>Search Console conectado</span><strong>{connectedCount}<small>/{domainCount}</small></strong></div><div><span>Propriedades verificadas</span><strong>{verifiedCount}<small>/{domainCount}</small></strong></div></section>
    <section className="seo-section"><div className="seo-section-heading"><div><span className="eyebrow">PRIORIDADES</span><h2>Precisam de atenção</h2><p>O próximo passo mais importante de cada domínio.</p></div><Link href="/operacao/seo?view=domains&status=attention">Ver todos</Link></div>{googleError ? <p className="seo-inline-alert">A verificação do Google está indisponível. As demais informações continuam atuais.</p> : null}<div className="seo-attention-list">{attention.map((item) => <Link key={item.domain.id} href={`/operacao/seo?domain=${encodeURIComponent(item.domain.fqdn)}`}><span className="seo-status-dot" /><span><strong>{item.domain.fqdn}</strong><small>{item.domain.organization.name}</small></span><span className="seo-attention-reason">{item.issue}</span><span>›</span></Link>)}{!attention.length ? <Empty title="Nenhuma pendência prioritária." text="Todos os sinais disponíveis estão regulares." /> : null}</div></section></>;
}

function Directory({ items, params }: { items: SeoItem[]; params: Params }) {
  const q = (params.q ?? "").trim().toLocaleLowerCase("pt-BR"), status = params.status ?? "all";
  const filtered = items.filter((item) => (!q || `${item.domain.fqdn} ${item.domain.organization.name}`.toLocaleLowerCase("pt-BR").includes(q)) && (status === "all" || status === "attention" && item.issue || status === "connected" && item.connected || status === "verified" && item.verified));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), page = Math.min(Math.max(parseInt(params.page ?? "1") || 1, 1), pages), shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageHref = (target: number) => `/operacao/seo?view=domains&q=${encodeURIComponent(params.q ?? "")}&status=${status}&page=${target}`;
  return <section className="seo-directory"><form className="seo-directory-tools" action="/operacao/seo"><input type="hidden" name="view" value="domains" /><label><span>Buscar domínio ou empresa</span><input name="q" defaultValue={params.q} placeholder="Ex.: avilaops.com" /></label><label><span>Status</span><select name="status" defaultValue={status}><option value="all">Todos</option><option value="attention">Precisam de atenção</option><option value="connected">Search Console conectado</option><option value="verified">Propriedade verificada</option></select></label><button className="secondary-button">Filtrar</button></form>
    <div className="seo-results-heading"><strong>{filtered.length} {filtered.length === 1 ? "resultado" : "resultados"}</strong><span>Página {page} de {pages}</span></div>{shown.length ? <div className="seo-domain-list"><div className="seo-domain-columns"><span>Domínio e empresa</span><span>DNS</span><span>Search Console</span><span>Saúde</span><span /></div>{shown.map((item) => <Link key={item.domain.id} href={`/operacao/seo?domain=${encodeURIComponent(item.domain.fqdn)}`}><span className="seo-domain-identity"><strong>{item.domain.fqdn}</strong><small>{item.domain.organization.name}</small></span><span><small className="mobile-only">DNS</small>{item.domain.cloudflareStatus ?? item.domain.status} · {item.domain._count.dnsRecords}</span><span><small className="mobile-only">Search Console</small>{item.verified ? "Verificado" : item.connected ? "Conectado" : "Não conectado"}</span><span className={`seo-state ${item.issue ? "attention" : "good"}`}>{item.issue ? "Atenção" : "Regular"}</span><span>›</span></Link>)}</div> : <Empty title="Nenhum domínio encontrado." text="Revise a busca ou escolha outro filtro." />}
    <nav className="seo-pagination" aria-label="Paginação"><Link aria-disabled={page === 1} href={pageHref(Math.max(1, page - 1))}>Anterior</Link><span>{page} / {pages}</span><Link aria-disabled={page === pages} href={pageHref(Math.min(pages, page + 1))}>Próxima</Link></nav></section>;
}

async function Detail({ item, params, googleConnection, auditConnection, lighthouseConnection, indexNowConnection, bingConnection, googleError }: { item: SeoItem; params: Params; googleConnection: Connection; auditConnection: Connection; lighthouseConnection: Connection; indexNowConnection: Connection; bingConnection: Connection; googleError: string }) {
  const fqdn = item.domain.fqdn, tab = ["summary", "diagnostic", "integrations"].includes(params.tab ?? "") ? params.tab! : "summary";
  const audit = auditConnection?.metadata as Audit | undefined, perf = lighthouseConnection?.metadata as Performance | undefined;
  const priorities = [item.issue, typeof perf?.performanceScore === "number" && perf.performanceScore < 80 ? `Melhorar desempenho (${perf.performanceScore}/100)` : null, audit?.llms?.ok === false ? "Adicionar llms.txt para mecanismos de IA" : null].filter(Boolean).slice(0, 3) as string[];
  const dates = [auditConnection?.lastSyncedAt, lighthouseConnection?.lastSyncedAt, googleConnection?.lastSyncedAt].filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime());
  let sitemaps: Awaited<ReturnType<typeof listSitemaps>> = [], detailError = googleError;
  if (tab === "integrations" && params.integration === "google") try { sitemaps = await listSitemaps(property(fqdn)); } catch (error) { detailError = error instanceof Error ? error.message : "Falha ao consultar o Search Console."; }
  const href = (target: string, integration?: string) => `/operacao/seo?domain=${encodeURIComponent(fqdn)}&tab=${target}${integration ? `&integration=${integration}` : ""}`;
  return <><header className="seo-domain-header"><Link href="/operacao/seo?view=domains" className="seo-back">‹ Domínios</Link><div><span className="eyebrow">{item.domain.organization.name}</span><h1>{fqdn}</h1><p><span className={`seo-state ${item.issue ? "attention" : "good"}`}>{item.issue ? "Precisa de atenção" : "Operação regular"}</span> · Atualizado {formatDateTime(dates[0])}</p></div></header><nav className="seo-local-nav seo-detail-tabs">{[["summary", "Resumo"], ["diagnostic", "Diagnóstico"], ["integrations", "Integrações"]].map(([key, label]) => <Link key={key} href={href(key)} aria-current={tab === key ? "page" : undefined}>{label}</Link>)}</nav>
    {tab === "summary" ? <div className="seo-detail-layout"><section className="seo-score-panel"><div><span>Score técnico</span><strong>{audit?.score ?? "-"}<small>/100</small></strong></div><div><span>Desempenho</span><strong>{perf?.performanceScore ?? "-"}<small>/100</small></strong></div><dl><div><dt>Maior conteúdo</dt><dd>{perf?.lcp ?? "Sem medição"}</dd></div><div><dt>Estabilidade visual</dt><dd>{perf?.cls ?? "Sem medição"}</dd></div><div><dt>Interação</dt><dd>{perf?.inp ?? "Sem medição"}</dd></div></dl></section><section className="seo-section seo-priorities"><div className="seo-section-heading"><div><span className="eyebrow">PRÓXIMOS PASSOS</span><h2>Prioridades deste domínio</h2></div><Link href={href("diagnostic")}>Ver diagnóstico</Link></div>{priorities.length ? <ol>{priorities.map((p, index) => <li key={p}><span>{index + 1}</span><strong>{p}</strong></li>)}</ol> : <Empty title="Nenhuma pendência prioritária." text="Os sinais disponíveis estão regulares." />}</section></div> : null}
    {tab === "diagnostic" ? <SeoAuditPanel key={fqdn} fqdn={fqdn} initialSeoConnection={connectionData(auditConnection)} initialLighthouseConnection={connectionData(lighthouseConnection)} /> : null}
    {tab === "integrations" ? <section className="seo-integrations"><div className="seo-integration-list">{[["google", "Google Search Console", item.verified ? "Propriedade verificada" : item.connected ? "Conectado" : "Não conectado", googleConnection], ["indexnow", "IndexNow", indexNowConnection?.lastSyncStatus ?? "Não configurado", indexNowConnection], ["bing", "Bing Webmaster Tools", bingConnection?.lastSyncStatus ?? "Não configurado", bingConnection]].map(([key, name, status, connection]) => <Link key={String(key)} href={href("integrations", String(key))} aria-current={params.integration === key ? "page" : undefined}><span><strong>{String(name)}</strong><small>{String(status)} · {formatDateTime((connection as Connection)?.lastSyncedAt)}</small></span><span>›</span></Link>)}</div><div className="seo-integration-detail">{!params.integration ? <Empty title="Escolha uma integração." text="Configurações e históricos aparecem somente quando solicitados." /> : null}{params.integration === "google" ? <SearchConsolePanel key={fqdn} siteUrl={property(fqdn)} sitemapUrl={sitemap(fqdn)} initialConnection={connectionData(googleConnection)} initialSitemaps={sitemaps} initialError={detailError} /> : null}{params.integration === "indexnow" ? <IndexNowPanel key={fqdn} fqdn={fqdn} initialConnection={connectionData(indexNowConnection)} /> : null}{params.integration === "bing" ? <BingWebmasterPanel key={fqdn} fqdn={fqdn} initialConnection={connectionData(bingConnection)} /> : null}</div></section> : null}</>;
}

function Empty({ title, text }: { title: string; text: string }) { return <div className="seo-empty"><strong>{title}</strong><p>{text}</p></div>; }
