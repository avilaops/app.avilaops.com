import Link from "next/link";
import BadgeStatus from "@/components/hub-social/BadgeStatus";
import BotaoEvidencia from "@/components/hub-social/FolhaEvidencia";
import { frescor, type Evidencia } from "@/lib/evidencia";
import { cn } from "@/lib/utils";
import type { DomainRow } from "@/components/dominios/tipos";

/**
 * Uma zona do Cloudflare. A linha inteira leva ao SEO do domínio: o link do
 * fqdn estica um ::after por cima da linha, e os controles internos (nome da
 * organização, botão de evidência) sobem com z-10 — nada de link dentro de
 * link nem botão dentro de link.
 */

const formatoData = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });

function formatarData(iso: string | null): string | null {
  if (!iso) return null;
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? null : formatoData.format(data);
}

function Separador() {
  return (
    <span aria-hidden="true" className="max-[560px]:hidden">
      ·
    </span>
  );
}

export default function LinhaDominio({ dominio, lidoEm }: { dominio: DomainRow; lidoEm: string }) {
  const hrefSeo = `/hub-social/seo?domain=${encodeURIComponent(dominio.fqdn)}`;
  const sync = frescor(dominio.dnsLastSyncedAt, new Date(lidoEm));
  const expira = formatarData(dominio.expiresAt);
  const registros = dominio.dnsRecordCount === 1 ? "1 registro DNS" : `${dominio.dnsRecordCount} registros DNS`;

  const evidencia: Evidencia = {
    rotulo: dominio.fqdn,
    origem: "domainAsset (Postgres)",
    formula:
      "uma linha de domains por zona do Cloudflare; status, plano e última sincronização gravados por POST /api/integrations/cloudflare/sync",
    referencia: dominio.id,
    lidoEm,
    gravadoEm: dominio.dnsLastSyncedAt,
    observacao: dominio.cloudflareZoneId ? `Zona do Cloudflare: ${dominio.cloudflareZoneId}` : undefined,
    bruto: dominio,
  };

  return (
    <li
      className={cn(
        "relative flex min-h-14 items-center gap-3 px-4 py-2.5 text-foreground transition-colors hover:bg-accent motion-reduce:transition-none",
        "has-[[data-linha-link]:active]:bg-accent has-[[data-linha-link]:focus-visible]:ring-[3px] has-[[data-linha-link]:focus-visible]:ring-inset has-[[data-linha-link]:focus-visible]:ring-ring/50",
      )}
    >
      <div className="min-w-0 flex-1">
        <Link
          href={hrefSeo}
          data-linha-link=""
          aria-label={`Abrir SEO de ${dominio.fqdn}`}
          className="block truncate font-mono text-[15px] font-medium text-foreground no-underline outline-none after:absolute after:inset-0 after:content-[''] min-[821px]:text-sm"
        >
          {dominio.fqdn}
        </Link>

        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-[13px] leading-5 text-muted-foreground max-[560px]:flex-col max-[560px]:gap-0">
          {dominio.organizationId ? (
            <Link
              href={`/clientes/${encodeURIComponent(dominio.organizationId)}`}
              className="relative z-10 truncate text-primary no-underline outline-none hover:underline focus-visible:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {dominio.organizationName}
            </Link>
          ) : (
            <span className="truncate">{dominio.organizationName}</span>
          )}
          <Separador />
          <span>{dominio.cloudflarePlan ? `Plano ${dominio.cloudflarePlan}` : "Sem plano"}</span>
          <Separador />
          <span className="tabular-nums">{registros}</span>
          <Separador />
          <span>{dominio.dnsLastSyncedAt ? `sync ${sync.texto}` : "nunca sincronizado"}</span>
          {expira ? (
            <>
              <Separador />
              <span>
                expira {expira}
                {dominio.autoRenew ? " · renovação automática" : ""}
              </span>
            </>
          ) : null}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1 self-center">
        <BadgeStatus status={dominio.cloudflareStatus} />
        <span className="relative z-10">
          <BotaoEvidencia evidencia={evidencia} rotulo={`Evidência de ${dominio.fqdn}`} />
        </span>
        <span aria-hidden="true" className="text-lg leading-none text-muted-foreground">
          ›
        </span>
      </div>
    </li>
  );
}
