import { redirect } from "next/navigation";
import CabecalhoPagina from "@/components/hub-social/CabecalhoPagina";
import AbasLink from "@/components/seo/AbasLink";
import DetalheDominio from "@/components/seo/DetalheDominio";
import DiretorioDominios from "@/components/seo/DiretorioDominios";
import VisaoGeral from "@/components/seo/VisaoGeral";
import { P, property, type Audit, type Params } from "@/components/seo/dados";
import { getAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listVerifiedSites } from "@/lib/search-console";

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
  const lidoEm = new Date().toISOString();

  const domains = await prisma.domainAsset.findMany({
    where: { status: { not: "ARCHIVED" } },
    include: { organization: { select: { name: true } }, _count: { select: { dnsRecords: true } } },
    orderBy: [{ organization: { name: "asc" } }, { fqdn: "asc" }],
  });
  const connections = await prisma.integrationConnection.findMany({
    where: { provider: { in: Object.values(P) } },
    orderBy: { updatedAt: "desc" },
  });
  const mapFor = (provider: string) =>
    new Map(connections.filter((item) => item.provider === provider).map((item) => [item.siteUrl, item]));
  const google = mapFor(P.google);
  const audits = mapFor(P.audit);
  const lighthouse = mapFor(P.lighthouse);
  const indexnow = mapFor(P.indexnow);
  const bing = mapFor(P.bing);

  let verified = new Set<string>();
  let googleError = "";
  try {
    verified = new Set(
      (await listVerifiedSites()).map((site) => site.siteUrl).filter((url): url is string => Boolean(url)),
    );
  } catch (error) {
    googleError = error instanceof Error ? error.message : "Não foi possível consultar o Google Search Console.";
  }

  const items = domains.map((domain) => {
    const connected = google.has(property(domain.fqdn));
    const isVerified = verified.has(property(domain.fqdn));
    const audit = audits.get(domain.fqdn)?.metadata as Audit | undefined;
    return { domain, connected, verified: isVerified, audit, issue: issueFor(connected, isVerified, audit) };
  });
  const selected = items.find((item) => item.domain.fqdn === params.domain);
  const view = params.view === "domains" ? "domains" : "overview";

  if (selected) {
    const fqdn = selected.domain.fqdn;
    return (
      <DetalheDominio
        item={selected}
        params={params}
        googleConnection={google.get(property(fqdn)) ?? null}
        auditConnection={audits.get(fqdn) ?? null}
        lighthouseConnection={lighthouse.get(fqdn) ?? null}
        indexNowConnection={indexnow.get(fqdn) ?? null}
        bingConnection={bing.get(fqdn) ?? null}
        googleError={googleError}
        lidoEm={lidoEm}
      />
    );
  }

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        eyebrow="Crescimento orgânico"
        titulo="SEO"
        subtitulo="Visibilidade e saúde de busca de todos os clientes."
        meta="Lido agora"
      />

      <AbasLink
        rotulo="Navegação de SEO"
        ativa={view}
        abas={[
          { chave: "overview", href: "/hub-social/seo", label: "Visão geral" },
          { chave: "domains", href: "/hub-social/seo?view=domains", label: "Domínios" },
        ]}
      />

      {view === "overview" ? (
        <VisaoGeral
          items={items}
          domainCount={domains.length}
          companyCount={new Set(domains.map((d) => d.organizationId)).size}
          connectedCount={items.filter((i) => i.connected).length}
          verifiedCount={items.filter((i) => i.verified).length}
          googleError={googleError}
          lidoEm={lidoEm}
        />
      ) : (
        <DiretorioDominios items={items} params={params} />
      )}
    </div>
  );
}
