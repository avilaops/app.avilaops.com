"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import CabecalhoPagina from "@/components/hub-social/CabecalhoPagina";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import GradeMetricas, { Metrica } from "@/components/hub-social/Metricas";
import LinhaDominio from "@/components/dominios/LinhaDominio";
import {
  estaAtiva,
  filtrarDominios,
  lerFiltro,
  type DomainRow,
  type FiltroStatus,
} from "@/components/dominios/tipos";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import type { Evidencia } from "@/lib/evidencia";
import { cn } from "@/lib/utils";

export type { DomainRow } from "@/components/dominios/tipos";

/** Linha como o GET /api/integrations/cloudflare/domains devolve. */
type DomainRowApi = {
  id: string;
  fqdn: string;
  cloudflarePlan: string | null;
  cloudflareStatus: string | null;
  dnsLastSyncedAt: string | null;
  dnsRecordCount: number;
  organizationName: string;
};

const ORIGEM_PAGINA = "prisma.domainAsset.findMany (cloudflareZoneId não nulo) em src/app/hub-social/dominios/page.tsx";
const ORIGEM_API = "GET /api/integrations/cloudflare/domains (prisma.domainAsset.findMany, cloudflareZoneId não nulo)";
const ROTA = "/hub-social/dominios";

const CHIPS: { valor: FiltroStatus; rotulo: string }[] = [
  { valor: "todas", rotulo: "Todas" },
  { valor: "ativas", rotulo: "Ativas" },
  { valor: "pendentes", rotulo: "Pendentes" },
];

const classesBotaoAcao = "min-h-[50px] w-full text-[15px] min-[560px]:w-auto min-[821px]:min-h-10 min-[821px]:text-sm";

/** Preserva o que só a página conhece (organização, zona, renovação) ao reler da API. */
function mesclar(anteriores: DomainRow[], novos: DomainRowApi[]): DomainRow[] {
  const porId = new Map(anteriores.map((dominio) => [dominio.id, dominio]));
  return novos.map((novo) => {
    const antigo = porId.get(novo.id);
    return {
      organizationId: antigo?.organizationId ?? null,
      cloudflareZoneId: antigo?.cloudflareZoneId ?? null,
      registrar: antigo?.registrar ?? null,
      expiresAt: antigo?.expiresAt ?? null,
      autoRenew: antigo?.autoRenew ?? null,
      nextActionAt: antigo?.nextActionAt ?? null,
      ...novo,
      dnsLastSyncedAt: novo.dnsLastSyncedAt ?? null,
    };
  });
}

export default function CloudflareDomainsPanel({
  initialDomains,
  lidoEm: lidoEmInicial,
  filtroInicial,
}: {
  initialDomains: DomainRow[];
  lidoEm: string;
  filtroInicial: FiltroStatus;
}) {
  const [domains, setDomains] = useState(initialDomains);
  const [lidoEm, setLidoEm] = useState(lidoEmInicial);
  const [relidoDaApi, setRelidoDaApi] = useState(false);
  const [status, setStatus] = useState<"idle" | "syncing" | "done">("idle");
  const [error, setError] = useState("");
  const [lastSummary, setLastSummary] = useState("");
  const [busca, setBusca] = useState("");

  // O filtro de status mora na URL (?status=): as métricas são links e os chips
  // reescrevem a query com history.replaceState, que o Next sincroniza.
  const searchParams = useSearchParams();
  const filtro = lerFiltro(searchParams.get("status") ?? filtroInicial);

  function aplicarFiltro(novo: FiltroStatus) {
    const url = new URL(window.location.href);
    if (novo === "todas") url.searchParams.delete("status");
    else url.searchParams.set("status", novo);
    window.history.replaceState(null, "", url);
  }

  function limparFiltros() {
    setBusca("");
    aplicarFiltro("todas");
  }

  async function handleSync() {
    setStatus("syncing");
    setError("");

    try {
      const response = await fetch("/api/integrations/cloudflare/sync", { method: "POST" });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setError(data.error ?? "Falha ao sincronizar.");
      } else {
        setLastSummary(`${data.results.length} domínios sincronizados agora.`);
        const refreshed = await fetch("/api/integrations/cloudflare/domains");
        const refreshedData = await refreshed.json();
        const novos: DomainRowApi[] = refreshedData.domains ?? [];
        setDomains((anteriores) => mesclar(anteriores, novos));
        setLidoEm(new Date().toISOString());
        setRelidoDaApi(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao sincronizar.");
    } finally {
      setStatus("done");
      window.setTimeout(() => setStatus("idle"), 2500);
    }
  }

  const sincronizando = status === "syncing";
  const botaoSincronizar = (variante: "default" | "outline" = "default") => (
    <Button type="button" variant={variante} onClick={handleSync} disabled={sincronizando} className={classesBotaoAcao}>
      {sincronizando ? "Sincronizando…" : "Sincronizar agora"}
    </Button>
  );

  const total = domains.length;
  const ativas = domains.filter(estaAtiva).length;
  const pendentes = total - ativas;
  const registrosDns = domains.reduce((soma, dominio) => soma + dominio.dnsRecordCount, 0);
  const gravadoEm = domains.reduce<string | null>(
    (maisRecente, dominio) =>
      dominio.dnsLastSyncedAt && (!maisRecente || dominio.dnsLastSyncedAt > maisRecente)
        ? dominio.dnsLastSyncedAt
        : maisRecente,
    null,
  );
  const bruto = { zonas: total, ativas, pendentes, registrosDns };

  const evidencia = (rotulo: string, formula: string): Evidencia => ({
    rotulo,
    origem: relidoDaApi ? ORIGEM_API : ORIGEM_PAGINA,
    formula,
    lidoEm,
    gravadoEm,
    observacao: "Gravado em = dnsLastSyncedAt mais recente entre as zonas.",
    bruto,
  });

  const visiveis = filtrarDominios(domains, busca, filtro);
  const contagemPorChip: Record<FiltroStatus, number> = { todas: total, ativas, pendentes };

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Domínios"
        subtitulo="Cada zona do Cloudflare vira uma organização e um domínio aqui, com o DNS espelhado."
        acoes={botaoSincronizar()}
      />

      {error ? (
        <p role="alert" className="text-[15px] leading-[1.5] text-[color:var(--red)] min-[821px]:text-sm">
          <strong className="font-semibold">Não foi possível sincronizar.</strong> {error}
        </p>
      ) : null}

      {lastSummary ? (
        <p role="status" className="text-[15px] leading-[1.5] text-muted-foreground min-[821px]:text-sm">
          {lastSummary}
        </p>
      ) : null}

      {total === 0 ? (
        <EstadoVazio
          titulo="Nenhuma zona do Cloudflare sincronizada."
          descricao="Sincronize para importar as zonas e espelhar o DNS."
          acao={botaoSincronizar()}
        />
      ) : (
        <>
          <GradeMetricas rotulo="Resumo das zonas">
            <Metrica
              rotulo="Zonas"
              valor={total}
              href={ROTA}
              evidencia={evidencia("Zonas", "contagem de linhas de domainAsset com cloudflareZoneId não nulo")}
            />
            <Metrica
              rotulo="Ativas"
              valor={ativas}
              tom="bom"
              href={`${ROTA}?status=ativas`}
              evidencia={evidencia("Ativas", 'contagem das zonas com cloudflareStatus = "active"')}
            />
            <Metrica
              rotulo="Pendentes"
              valor={pendentes}
              tom={pendentes > 0 ? "atencao" : "neutro"}
              href={`${ROTA}?status=pendentes`}
              evidencia={evidencia(
                "Pendentes",
                'contagem das zonas com cloudflareStatus diferente de "active" (inclui status vazio)',
              )}
            />
            <Metrica
              rotulo="Registros DNS"
              valor={registrosDns}
              evidencia={evidencia("Registros DNS", "soma de _count.dnsRecords de cada zona")}
            />
          </GradeMetricas>

          <Card className="w-full min-w-0 gap-0 overflow-hidden py-0 shadow-none">
            <div className="flex flex-col gap-3 border-b border-border px-4 pt-4 pb-3">
              <div>
                <h2 className="text-[15px] font-semibold text-foreground">Zonas do Cloudflare</h2>
                <p className="mt-0.5 text-[13px] text-muted-foreground" aria-live="polite">
                  {visiveis.length === total
                    ? `${total} zonas. Toque numa linha para abrir o SEO do domínio.`
                    : `${visiveis.length} de ${total} zonas.`}
                </p>
              </div>

              <div className="flex flex-col gap-3 min-[821px]:flex-row min-[821px]:items-center">
                <div className="min-w-0 min-[821px]:w-[320px]">
                  <Label htmlFor="busca-dominios" className="sr-only">
                    Buscar por domínio ou organização
                  </Label>
                  <Input
                    id="busca-dominios"
                    type="search"
                    value={busca}
                    onChange={(evento) => setBusca(evento.target.value)}
                    placeholder="Buscar domínio ou organização"
                    autoComplete="off"
                    className="h-11 text-[15px] min-[821px]:h-9 min-[821px]:text-sm"
                  />
                </div>

                <div
                  role="group"
                  aria-label="Filtrar por status"
                  className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] min-[821px]:mx-0 min-[821px]:px-0"
                >
                  {CHIPS.map((chip) => {
                    const ativo = filtro === chip.valor;
                    return (
                      <button
                        key={chip.valor}
                        type="button"
                        aria-pressed={ativo}
                        onClick={() => aplicarFiltro(chip.valor)}
                        className={cn(
                          "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[14px] font-medium whitespace-nowrap transition-transform outline-none active:scale-[0.985] focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none",
                          ativo
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-transparent text-foreground hover:bg-accent",
                        )}
                      >
                        {chip.rotulo}
                        <span className={cn("tabular-nums", ativo ? "opacity-80" : "text-muted-foreground")}>
                          {contagemPorChip[chip.valor]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {visiveis.length === 0 ? (
              <div className="p-4">
                <EstadoVazio
                  compacto
                  titulo="Nenhum domínio com esse filtro."
                  acao={
                    <Button type="button" variant="outline" onClick={limparFiltros} className={classesBotaoAcao}>
                      Limpar filtros
                    </Button>
                  }
                />
              </div>
            ) : (
              <ul className="m-0 list-none divide-y divide-border p-0">
                {visiveis.map((dominio) => (
                  <LinhaDominio key={dominio.id} dominio={dominio} lidoEm={lidoEm} />
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
