import Link from "next/link";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import GradeMetricas, { Metrica } from "@/components/hub-social/Metricas";
import { Button } from "@/components/shadcn/button";
import { CartaoLista, Chevron, LINHA_ITEM, LINHA_LINK, MensagemStatus } from "@/components/hub-social/comum";
import { BASE, hrefDominio, P, type SeoItem } from "@/components/seo/dados";
import { nomeProprio } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Visão geral do SEO: quatro contadores auditáveis e as cinco prioridades. */

export default function VisaoGeral({
  items,
  domainCount,
  companyCount,
  connectedCount,
  verifiedCount,
  googleError,
  lidoEm,
}: {
  items: SeoItem[];
  domainCount: number;
  companyCount: number;
  connectedCount: number;
  verifiedCount: number;
  googleError: string;
  lidoEm: string;
}) {
  const attention = items.filter((item) => item.issue).slice(0, 5);
  const consultaDominios = 'prisma.domainAsset.findMany({ where: { status: { not: "ARCHIVED" } } })';

  return (
    <div className="space-y-6">
      <GradeMetricas rotulo="Resumo de SEO">
        <Metrica
          rotulo="Empresas acompanhadas"
          valor={companyCount}
          evidencia={{
            rotulo: "Empresas acompanhadas",
            origem: "domainAsset (Postgres)",
            funcao: consultaDominios,
            formula: "organizationId distintos entre os domainAsset com status ≠ ARCHIVED",
            lidoEm,
            bruto: { empresas: companyCount, dominios: domainCount },
          }}
        />
        <Metrica
          rotulo="Domínios ativos"
          valor={domainCount}
          href={`${BASE}?view=domains`}
          evidencia={{
            rotulo: "Domínios ativos",
            origem: "domainAsset (Postgres)",
            funcao: consultaDominios,
            formula: "contagem de domainAsset com status ≠ ARCHIVED",
            lidoEm,
            bruto: { dominios: domainCount, fqdns: items.map((item) => item.domain.fqdn) },
          }}
        />
        <Metrica
          rotulo="Search Console conectado"
          valor={`${connectedCount}/${domainCount}`}
          href={`${BASE}?view=domains&status=connected`}
          evidencia={{
            rotulo: "Search Console conectado",
            origem: "integrationConnection (Postgres)",
            funcao: `prisma.integrationConnection.findMany({ where: { provider: { in: [...] } } })`,
            formula: `integrationConnection provider ${P.google} por siteUrl sc-domain:<fqdn>, dividido pelos domínios ativos`,
            lidoEm,
            bruto: {
              conectados: connectedCount,
              dominios: domainCount,
              siteUrls: items.filter((item) => item.connected).map((item) => `sc-domain:${item.domain.fqdn}`),
            },
          }}
        />
        <Metrica
          rotulo="Propriedades verificadas"
          valor={`${verifiedCount}/${domainCount}`}
          href={`${BASE}?view=domains&status=verified`}
          tom={googleError ? "atencao" : "neutro"}
          evidencia={{
            rotulo: "Propriedades verificadas",
            origem: "Google Search Console API",
            funcao: "listVerifiedSites() em src/lib/search-console.ts",
            formula: "domínios ativos cujo sc-domain:<fqdn> aparece em listVerifiedSites()",
            lidoEm,
            observacao: googleError || undefined,
            bruto: {
              verificadas: verifiedCount,
              dominios: domainCount,
              siteUrls: items.filter((item) => item.verified).map((item) => `sc-domain:${item.domain.fqdn}`),
            },
          }}
        />
      </GradeMetricas>

      {googleError ? (
        <MensagemStatus>
          A verificação do Google está indisponível. As demais informações continuam atuais.
        </MensagemStatus>
      ) : null}

      <CartaoLista
        titulo="Precisam de atenção"
        descricao="O próximo passo mais importante de cada domínio."
        acao={
          <Button asChild variant="link" className="-mr-2 min-h-11 shrink-0 px-2">
            <Link href={`${BASE}?view=domains&status=attention`}>Ver todos</Link>
          </Button>
        }
      >
        {attention.length ? (
          <ul className="m-0 list-none p-0">
            {attention.map((item) => (
              <li key={item.domain.id} className={LINHA_ITEM}>
                <Link href={hrefDominio(item.domain.fqdn)} className={cn(LINHA_LINK, "min-h-14")}>
                  <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-[color:var(--amber)]" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 min-[821px]:flex-row min-[821px]:items-center min-[821px]:gap-4">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium min-[821px]:text-sm">
                        {item.domain.fqdn}
                      </span>
                      <span className="block truncate text-[13px] text-muted-foreground">
                        {nomeProprio(item.domain.organization.name)}
                      </span>
                    </span>
                    <span className="text-[13px] text-muted-foreground min-[821px]:text-right min-[821px]:text-sm min-[821px]:text-foreground">
                      {item.issue}
                    </span>
                  </span>
                  <Chevron />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-4">
            <EstadoVazio
              compacto
              titulo="Nenhuma pendência prioritária."
              descricao="Todos os sinais disponíveis estão regulares."
              acao={{ label: "Ver domínios", href: `${BASE}?view=domains` }}
            />
          </div>
        )}
      </CartaoLista>
    </div>
  );
}
