import Link from "next/link";
import BadgeStatus from "@/components/sistema/Status";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { BOTAO, CAMPO, CartaoLista, Chevron, LINHA_ITEM, LINHA_LINK } from "@/components/seo/comum";
import { hrefDominio, PAGE_SIZE, type Params, type SeoItem } from "@/components/seo/dados";
import { cn } from "@/lib/utils";

/**
 * Diretório de domínios. Busca, filtro e página vivem na URL: o formulário é
 * GET para /hub-social/seo com view=domains escondido, e a paginação são links.
 * O Select é nativo de propósito — o do shadcn só emite o campo depois de
 * hidratar, e aqui o filtro precisa funcionar como formulário puro.
 */

const SELECT_NATIVO = cn(
  "w-full min-w-0 appearance-none rounded-md border border-input bg-transparent px-3 py-1 shadow-xs outline-none transition-[color,box-shadow] dark:bg-input/30",
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
  CAMPO,
);

const ROTULO_CAMPO = "text-[13px] font-medium text-muted-foreground";

function RotuloAndar({ children }: { children: string }) {
  return <span className="text-[13px] text-muted-foreground min-[821px]:sr-only">{children}</span>;
}

export default function DiretorioDominios({ items, params }: { items: SeoItem[]; params: Params }) {
  const q = (params.q ?? "").trim().toLocaleLowerCase("pt-BR");
  const status = params.status ?? "all";
  const filtered = items.filter(
    (item) =>
      (!q || `${item.domain.fqdn} ${item.domain.organization.name}`.toLocaleLowerCase("pt-BR").includes(q)) &&
      (status === "all" ||
        (status === "attention" && item.issue) ||
        (status === "connected" && item.connected) ||
        (status === "verified" && item.verified)),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(Math.max(parseInt(params.page ?? "1") || 1, 1), pages);
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageHref = (target: number) =>
    `/hub-social/seo?view=domains&q=${encodeURIComponent(params.q ?? "")}&status=${status}&page=${target}`;

  return (
    <section aria-label="Diretório de domínios" className="space-y-4">
      <form
        action="/hub-social/seo"
        className="flex flex-col gap-3 min-[821px]:flex-row min-[821px]:items-end"
      >
        <input type="hidden" name="view" value="domains" />
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className={ROTULO_CAMPO}>Buscar domínio ou empresa</span>
          <Input name="q" defaultValue={params.q} placeholder="Ex.: avilaops.com" className={CAMPO} />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5 min-[821px]:w-[240px]">
          <span className={ROTULO_CAMPO}>Status</span>
          <select name="status" defaultValue={status} className={SELECT_NATIVO}>
            <option value="all">Todos</option>
            <option value="attention">Precisam de atenção</option>
            <option value="connected">Search Console conectado</option>
            <option value="verified">Propriedade verificada</option>
          </select>
        </label>
        <Button type="submit" variant="outline" className={cn(BOTAO, "min-h-12")}>
          Filtrar
        </Button>
      </form>

      <p className="text-[13px] text-muted-foreground" aria-live="polite">
        <span className="font-medium text-foreground">
          {filtered.length} {filtered.length === 1 ? "resultado" : "resultados"}
        </span>{" "}
        · Página {page} de {pages}
      </p>

      {shown.length ? (
        <CartaoLista rotulo="Domínios">
          <div
            aria-hidden="true"
            className="hidden border-b border-border px-4 py-2 text-[12px] font-medium text-muted-foreground min-[821px]:grid min-[821px]:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.8fr)_16px] min-[821px]:gap-4"
          >
            <span>Domínio e empresa</span>
            <span>DNS</span>
            <span>Search Console</span>
            <span>Saúde</span>
            <span />
          </div>
          <ul className="m-0 list-none p-0">
            {shown.map((item) => (
              <li key={item.domain.id} className={LINHA_ITEM}>
                <Link
                  href={hrefDominio(item.domain.fqdn)}
                  className={cn(
                    LINHA_LINK,
                    "min-h-[60px] min-[821px]:grid min-[821px]:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.8fr)_16px] min-[821px]:gap-4",
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-2 min-[821px]:contents">
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-medium min-[821px]:text-sm">
                        {item.domain.fqdn}
                      </span>
                      <span className="block truncate text-[13px] text-muted-foreground">
                        {item.domain.organization.name}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      <RotuloAndar>DNS</RotuloAndar>
                      <BadgeStatus status={item.domain.cloudflareStatus ?? item.domain.status} />
                      <span className="font-mono text-[13px] tabular-nums text-muted-foreground">
                        · {item.domain._count.dnsRecords} registros
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      <RotuloAndar>Search Console</RotuloAndar>
                      {item.verified ? (
                        <BadgeStatus status="verified" texto="Verificado" />
                      ) : item.connected ? (
                        <BadgeStatus status="connected" texto="Conectado" />
                      ) : (
                        <BadgeStatus status="disconnected" texto="Não conectado" />
                      )}
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      <RotuloAndar>Saúde</RotuloAndar>
                      {item.issue ? (
                        <BadgeStatus status="attention" tom="atencao" texto="Atenção" titulo={item.issue} />
                      ) : (
                        <BadgeStatus status="regular" tom="bom" texto="Regular" />
                      )}
                    </span>
                  </span>
                  <Chevron />
                </Link>
              </li>
            ))}
          </ul>
        </CartaoLista>
      ) : (
        <EstadoVazio
          titulo="Nenhum domínio encontrado."
          descricao="Revise a busca ou escolha outro filtro."
          acao={{ label: "Limpar filtros", href: "/hub-social/seo?view=domains" }}
        />
      )}

      <nav aria-label="Paginação" className="flex items-center justify-between gap-3">
        <Button
          asChild
          variant="outline"
          className="min-h-11 px-4 text-[15px] aria-disabled:pointer-events-none aria-disabled:opacity-50 min-[821px]:min-h-9 min-[821px]:text-sm"
        >
          <Link aria-disabled={page === 1} href={pageHref(Math.max(1, page - 1))}>
            Anterior
          </Link>
        </Button>
        <span className="font-mono text-[13px] tabular-nums text-muted-foreground">
          {page} / {pages}
        </span>
        <Button
          asChild
          variant="outline"
          className="min-h-11 px-4 text-[15px] aria-disabled:pointer-events-none aria-disabled:opacity-50 min-[821px]:min-h-9 min-[821px]:text-sm"
        >
          <Link aria-disabled={page === pages} href={pageHref(Math.min(pages, page + 1))}>
            Próxima
          </Link>
        </Button>
      </nav>
    </section>
  );
}
