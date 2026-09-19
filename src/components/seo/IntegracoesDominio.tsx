import Link from "next/link";
import type { ReactNode } from "react";
import BadgeStatus from "@/components/sistema/Status";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import BingWebmasterPanel from "@/components/BingWebmasterPanel";
import IndexNowPanel from "@/components/IndexNowPanel";
import SearchConsolePanel from "@/components/SearchConsolePanel";
import { CartaoLista, Chevron, formatarDataHora, LINHA_ITEM, LINHA_LINK, rotuloIntegracao } from "@/components/hub-social/comum";
import { connectionData, property, sitemap, type Connection, type SeoItem } from "@/components/seo/dados";
import type { listSitemaps } from "@/lib/search-console";
import { cn } from "@/lib/utils";

/**
 * Aba Integrações: lista das três integrações à esquerda (1/3) e o painel da
 * escolhida à direita (2/3); no celular, empilhado. A escolha é o parâmetro
 * `integration` da URL.
 */

type Linha = {
  chave: "google" | "indexnow" | "bing";
  nome: string;
  badge: ReactNode;
  connection: Connection;
};

export default function IntegracoesDominio({
  item,
  integration,
  href,
  googleConnection,
  indexNowConnection,
  bingConnection,
  sitemaps,
  detailError,
}: {
  item: SeoItem;
  integration: string | undefined;
  href: (target: string, integration?: string) => string;
  googleConnection: Connection;
  indexNowConnection: Connection;
  bingConnection: Connection;
  sitemaps: Awaited<ReturnType<typeof listSitemaps>>;
  detailError: string;
}) {
  const fqdn = item.domain.fqdn;

  const linhas: Linha[] = [
    {
      chave: "google",
      nome: "Google Search Console",
      badge: item.verified ? (
        <BadgeStatus status="verified" texto="Propriedade verificada" />
      ) : item.connected ? (
        <BadgeStatus status="connected" texto="Conectado" />
      ) : (
        <BadgeStatus status="disconnected" texto="Não conectado" />
      ),
      connection: googleConnection,
    },
    {
      chave: "indexnow",
      nome: "IndexNow",
      badge: <BadgeStatus {...rotuloIntegracao(indexNowConnection?.lastSyncStatus)} />,
      connection: indexNowConnection,
    },
    {
      chave: "bing",
      nome: "Bing Webmaster Tools",
      badge: <BadgeStatus {...rotuloIntegracao(bingConnection?.lastSyncStatus)} />,
      connection: bingConnection,
    },
  ];

  return (
    <section aria-label="Integrações do domínio" className="grid gap-6 max-[820px]:gap-4 min-[821px]:grid-cols-3 min-[821px]:items-start">
      <div className="min-[821px]:col-span-1">
        <CartaoLista rotulo="Integrações">
          <ul className="m-0 list-none p-0">
            {linhas.map((linha) => {
              const atual = integration === linha.chave;
              return (
                <li key={linha.chave} className={LINHA_ITEM}>
                  <Link
                    href={href("integrations", linha.chave)}
                    aria-current={atual ? "page" : undefined}
                    className={cn(LINHA_LINK, "min-h-[60px] aria-[current=page]:bg-accent")}
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="truncate text-[15px] font-medium min-[821px]:text-sm">{linha.nome}</span>
                      <span className="flex flex-wrap items-center gap-2">
                        {linha.badge}
                        <span className="text-[13px] text-muted-foreground">
                          última sync {formatarDataHora(linha.connection?.lastSyncedAt) ?? "nunca"}
                        </span>
                      </span>
                    </span>
                    <Chevron />
                  </Link>
                </li>
              );
            })}
          </ul>
        </CartaoLista>
      </div>

      <div className="min-w-0 min-[821px]:col-span-2">
        {!integration ? (
          <EstadoVazio
            compacto
            titulo="Escolha uma integração."
            descricao="Configurações e históricos aparecem somente quando solicitados."
            acao={{ label: "Abrir Google Search Console", href: href("integrations", "google") }}
          />
        ) : null}
        {integration === "google" ? (
          <SearchConsolePanel
            key={fqdn}
            siteUrl={property(fqdn)}
            sitemapUrl={sitemap(fqdn)}
            initialConnection={connectionData(googleConnection)}
            initialSitemaps={sitemaps}
            initialError={detailError}
          />
        ) : null}
        {integration === "indexnow" ? (
          <IndexNowPanel key={fqdn} fqdn={fqdn} initialConnection={connectionData(indexNowConnection)} />
        ) : null}
        {integration === "bing" ? (
          <BingWebmasterPanel key={fqdn} fqdn={fqdn} initialConnection={connectionData(bingConnection)} />
        ) : null}
      </div>
    </section>
  );
}
