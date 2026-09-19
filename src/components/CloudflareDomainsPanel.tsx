"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import CabecalhoPagina from "@/components/hub-social/CabecalhoPagina";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import GradeMetricas, { Metrica } from "@/components/hub-social/Metricas";
import LinhaDominio from "@/components/dominios/LinhaDominio";
import ConsultaRegistroBr from "@/components/dominios/ConsultaRegistroBr";
import {
  estaAtiva,
  estaVencendo,
  filtrarDominios,
  lerFiltro,
  JANELA_ATENCAO_DIAS,
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

/** Linha como o POST /api/integrations/registro-br/sync devolve. */
type DominioRegistroBr = {
  id: string;
  fqdn: string;
  status: string;
  expiraEm: string | null;
  diasRestantes: number | null;
  titular: string | null;
};

type ResumoRegistroBr = {
  consultados: number;
  atualizados: number;
  vencendoEm60Dias: number;
  semDataPublicada: number;
  falharam: number;
  semRegistro: string[];
};

const ORIGEM_PAGINA = "prisma.domainAsset.findMany (cloudflareZoneId não nulo) em src/app/hub-social/dominios/page.tsx";
const ORIGEM_API = "GET /api/integrations/cloudflare/domains (prisma.domainAsset.findMany, cloudflareZoneId não nulo)";
const ORIGEM_REGISTRO_BR = "POST /api/integrations/registro-br/sync (evento expiration do RDAP em rdap.registro.br)";
const ROTA = "/hub-social/dominios";

const CHIPS: { valor: FiltroStatus; rotulo: string }[] = [
  { valor: "todas", rotulo: "Todas" },
  { valor: "ativas", rotulo: "Ativas" },
  { valor: "pendentes", rotulo: "Pendentes" },
  { valor: "vencendo", rotulo: "Vencendo" },
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
      registroBrLidoEm: antigo?.registroBrLidoEm ?? null,
      registroBrTitular: antigo?.registroBrTitular ?? null,
      ...novo,
      dnsLastSyncedAt: novo.dnsLastSyncedAt ?? null,
    };
  });
}

/** Aplica na tela o que o Registro.br acabou de dizer, sem recarregar a página. */
function aplicarRegistroBr(anteriores: DomainRow[], atualizados: DominioRegistroBr[], lidoEm: string): DomainRow[] {
  const porId = new Map(atualizados.map((dominio) => [dominio.id, dominio]));
  return anteriores.map((dominio) => {
    const novo = porId.get(dominio.id);
    if (!novo) return dominio;
    return {
      ...dominio,
      // Só o que o registro respondeu de fato substitui o que já estava: uma
      // consulta que falhou não pode apagar a data que a anterior trouxe.
      expiresAt: novo.status === "REGISTRADO" ? novo.expiraEm : dominio.expiresAt,
      registrar: novo.status === "REGISTRADO" ? "Registro.br" : dominio.registrar,
      registroBrLidoEm: novo.status === "DESCONHECIDO" ? dominio.registroBrLidoEm : lidoEm,
      registroBrTitular: novo.titular ?? dominio.registroBrTitular,
    };
  });
}

function descreverRegistroBr(resumo: ResumoRegistroBr): string {
  const partes = [
    `${resumo.consultados} domínios .br consultados no Registro.br`,
    `${resumo.atualizados} com vencimento atualizado`,
  ];
  if (resumo.semDataPublicada > 0) partes.push(`${resumo.semDataPublicada} sem data publicada`);
  if (resumo.falharam > 0) partes.push(`${resumo.falharam} sem resposta`);
  if (resumo.semRegistro.length > 0) {
    partes.push(`sem registro no .br: ${resumo.semRegistro.join(", ")}`);
  }
  return `${partes.join(" · ")}.`;
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
  const [statusRegistroBr, setStatusRegistroBr] = useState<"idle" | "syncing">("idle");
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

  /**
   * O Cloudflare não sabe quando o domínio vence. Quem sabe é o registro, e
   * esta é a única fonte de `expires_at` para os `.br` da carteira.
   */
  async function handleVencimentos() {
    setStatusRegistroBr("syncing");
    setError("");

    try {
      const response = await fetch("/api/integrations/registro-br/sync", { method: "POST" });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setError(data.error ?? "Falha ao consultar o Registro.br.");
        return;
      }

      const agora = new Date().toISOString();
      setDomains((anteriores) => aplicarRegistroBr(anteriores, data.dominios ?? [], agora));
      setLidoEm(agora);
      setLastSummary(descreverRegistroBr(data.resumo));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao consultar o Registro.br.");
    } finally {
      setStatusRegistroBr("idle");
    }
  }

  const sincronizando = status === "syncing";
  const consultandoRegistro = statusRegistroBr === "syncing";

  const botaoSincronizar = (variante: "default" | "outline" = "default") => (
    <Button type="button" variant={variante} onClick={handleSync} disabled={sincronizando} className={classesBotaoAcao}>
      {sincronizando ? "Sincronizando…" : "Sincronizar agora"}
    </Button>
  );

  const botaoVencimentos = (
    <Button
      type="button"
      variant="outline"
      onClick={handleVencimentos}
      disabled={consultandoRegistro}
      className={classesBotaoAcao}
    >
      {consultandoRegistro ? "Consultando o Registro.br…" : "Atualizar vencimentos"}
    </Button>
  );

  const agora = new Date(lidoEm);
  const total = domains.length;
  const ativas = domains.filter(estaAtiva).length;
  const pendentes = total - ativas;
  const vencendo = domains.filter((dominio) => estaVencendo(dominio, agora)).length;
  const registrosDns = domains.reduce((soma, dominio) => soma + dominio.dnsRecordCount, 0);
  const comVencimento = domains.filter((dominio) => dominio.expiresAt).length;
  const gravadoEm = domains.reduce<string | null>(
    (maisRecente, dominio) =>
      dominio.dnsLastSyncedAt && (!maisRecente || dominio.dnsLastSyncedAt > maisRecente)
        ? dominio.dnsLastSyncedAt
        : maisRecente,
    null,
  );
  const lidoNoRegistroEm = domains.reduce<string | null>(
    (maisRecente, dominio) =>
      dominio.registroBrLidoEm && (!maisRecente || dominio.registroBrLidoEm > maisRecente)
        ? dominio.registroBrLidoEm
        : maisRecente,
    null,
  );
  const bruto = { zonas: total, ativas, pendentes, registrosDns, vencendo, comVencimento };

  const evidencia = (rotulo: string, formula: string): Evidencia => ({
    rotulo,
    origem: relidoDaApi ? ORIGEM_API : ORIGEM_PAGINA,
    formula,
    lidoEm,
    gravadoEm,
    observacao: "Gravado em = dnsLastSyncedAt mais recente entre as zonas.",
    bruto,
  });

  const visiveis = filtrarDominios(domains, busca, filtro, agora);
  const contagemPorChip: Record<FiltroStatus, number> = { todas: total, ativas, pendentes, vencendo };

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Domínios"
        subtitulo="Cada zona do Cloudflare vira uma organização e um domínio aqui, com o DNS espelhado. O vencimento dos .br vem do Registro.br."
        acoes={
          <div className="flex flex-col gap-2 min-[560px]:flex-row">
            {botaoVencimentos}
            {botaoSincronizar()}
          </div>
        }
      />

      {error ? (
        <p role="alert" className="text-[15px] leading-[1.5] text-[color:var(--red)] min-[821px]:text-sm">
          <strong className="font-semibold">Não foi possível concluir.</strong> {error}
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
              rotulo={`Vencendo em ${JANELA_ATENCAO_DIAS} dias`}
              valor={vencendo}
              tom={vencendo > 0 ? "ruim" : "neutro"}
              detalhe={
                comVencimento === total ? undefined : `${total - comVencimento} sem data de vencimento conhecida`
              }
              href={`${ROTA}?status=vencendo`}
              evidencia={{
                rotulo: `Vencendo em ${JANELA_ATENCAO_DIAS} dias`,
                origem: lidoNoRegistroEm
                  ? ORIGEM_REGISTRO_BR
                  : "domains.expires_at (Postgres). Nenhum domínio consultado no Registro.br ainda.",
                formula: `contagem das zonas cujo expires_at cai dentro de ${JANELA_ATENCAO_DIAS} dias (inclui as já vencidas); zona sem data não entra na conta`,
                lidoEm,
                gravadoEm: lidoNoRegistroEm,
                observacao: lidoNoRegistroEm
                  ? "Gravado em = leitura mais recente do Registro.br entre as zonas. Domínios fora do .br não têm data aqui."
                  : "Nenhuma leitura do Registro.br registrada: use “Atualizar vencimentos”. Sem isso, este número é zero por falta de dado, não por estar tudo em dia.",
                bruto,
              }}
            />
            <Metrica
              rotulo="Registros DNS"
              valor={registrosDns}
              evidencia={evidencia("Registros DNS", "soma de _count.dnsRecords de cada zona")}
            />
          </GradeMetricas>

          <ConsultaRegistroBr />

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
