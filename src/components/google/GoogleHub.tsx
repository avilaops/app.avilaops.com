"use client";

import { useState, useSyncExternalStore, type MouseEvent } from "react";
import GradeMetricas, { Metrica } from "@/components/hub-social/Metricas";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn/tabs";
import type { Evidencia } from "@/lib/evidencia";
import type { Ga4OverviewMetrics } from "@/lib/google-analytics";
import type { MappedLocation } from "@/lib/google-mybusiness";
import Ga4Resumo from "./Ga4Resumo";
import PerfisNegocio from "./PerfisNegocio";
import RespostasIA from "./RespostasIA";
import { notaComDuasCasas, OBSERVACAO_GA4, OBSERVACAO_MEU_NEGOCIO, ORIGEM_GA4, ORIGEM_MEU_NEGOCIO } from "./tons";

export type GoogleHubProps = {
  locations: MappedLocation[];
  ga4: Ga4OverviewMetrics;
  lidoEm: string;
};

type Aba = "perfis" | "ia" | "ga4";

const ABAS: { valor: Aba; rotulo: string }[] = [
  { valor: "perfis", rotulo: "Perfis" },
  { valor: "ia", rotulo: "Respostas com IA" },
  { valor: "ga4", rotulo: "GA4" },
];

/*
 * As métricas apontam para "#perfis" e "#ga4". Como o Radix desmonta a aba
 * inativa, o hash sozinho não abriria a aba: lemos o hash da URL (para quem
 * chega com ele) e capturamos o clique nas métricas (para quem já está aqui).
 */
function assinarHash(aoMudar: () => void) {
  window.addEventListener("hashchange", aoMudar);
  return () => window.removeEventListener("hashchange", aoMudar);
}

function lerHash() {
  return window.location.hash;
}

function hashNoServidor() {
  return "";
}

function abaDoHash(hash: string | null | undefined): Aba | null {
  const limpo = (hash ?? "").replace(/^#/, "");
  return limpo === "perfis" || limpo === "ga4" ? limpo : null;
}

function tomDaNota(nota: number | null) {
  if (nota === null) return "neutro" as const;
  if (nota >= 4.5) return "bom" as const;
  if (nota >= 4) return "atencao" as const;
  return "ruim" as const;
}

export default function GoogleHub({ locations, ga4, lidoEm }: GoogleHubProps) {
  const hash = useSyncExternalStore(assinarHash, lerHash, hashNoServidor);
  const [abaEscolhida, setAbaEscolhida] = useState<Aba | null>(null);
  const [localId, setLocalId] = useState(locations[0]?.id ?? "");

  const aba: Aba = abaEscolhida ?? abaDoHash(hash) ?? "perfis";

  const totalAvaliacoes = locations.reduce((soma, loc) => soma + loc.reviewCount, 0);
  const pendentes = locations.reduce((soma, loc) => soma + loc.pendingReviews, 0);
  const notaMedia =
    locations.length > 0 ? locations.reduce((soma, loc) => soma + loc.rating, 0) / locations.length : null;

  const brutoLocais = locations.map((loc) => ({
    id: loc.id,
    name: loc.name,
    rating: loc.rating,
    reviewCount: loc.reviewCount,
    pendingReviews: loc.pendingReviews,
  }));

  const evidenciaNegocio = (rotulo: string, formula: string): Evidencia => ({
    rotulo,
    origem: ORIGEM_MEU_NEGOCIO,
    formula,
    lidoEm,
    observacao: OBSERVACAO_MEU_NEGOCIO,
    bruto: brutoLocais,
  });

  const evidenciaAtivos: Evidencia = {
    rotulo: "GA4 ativos agora",
    origem: ORIGEM_GA4,
    formula: "campo realtimeActiveUsers devolvido por getGa4OverviewMetrics()",
    lidoEm,
    observacao: OBSERVACAO_GA4,
    bruto: { realtimeActiveUsers: ga4.realtimeActiveUsers, lastUpdated: ga4.lastUpdated },
  };

  function aoClicarMetrica(evento: MouseEvent<HTMLDivElement>) {
    const alvo = evento.target instanceof Element ? evento.target.closest('a[href^="#"]') : null;
    const destino = abaDoHash(alvo?.getAttribute("href"));
    if (destino) setAbaEscolhida(destino);
  }

  function testarLocal(local: MappedLocation) {
    setLocalId(local.id);
    setAbaEscolhida("ia");
  }

  return (
    <div className="flex flex-col gap-6">
      <div onClickCapture={aoClicarMetrica}>
        <GradeMetricas rotulo="Resumo do Google">
          <Metrica
            rotulo="Locais mapeados"
            valor={locations.length}
            href="#perfis"
            evidencia={evidenciaNegocio("Locais mapeados", "quantidade de itens devolvidos por listBusinessLocations()")}
          />
          <Metrica
            rotulo="Nota média"
            valor={notaMedia === null ? "—" : `★ ${notaComDuasCasas(notaMedia)}`}
            tom={tomDaNota(notaMedia)}
            evidencia={evidenciaNegocio("Nota média", "média aritmética de rating de todos os locais")}
          />
          <Metrica
            rotulo="Avaliações totais"
            valor={totalAvaliacoes.toLocaleString("pt-BR")}
            evidencia={evidenciaNegocio("Avaliações totais", "soma de reviewCount de todos os locais")}
          />
          <Metrica
            rotulo="Avaliações pendentes"
            valor={pendentes}
            tom={pendentes > 0 ? "ruim" : "bom"}
            href="#perfis"
            evidencia={evidenciaNegocio("Avaliações pendentes", "soma de pendingReviews de todos os locais")}
          />
          <Metrica
            rotulo="GA4 ativos agora"
            valor={ga4.realtimeActiveUsers.toLocaleString("pt-BR")}
            detalhe="usuários em tempo real"
            tom={ga4.realtimeActiveUsers > 0 ? "bom" : "neutro"}
            href="#ga4"
            evidencia={evidenciaAtivos}
          />
        </GradeMetricas>
      </div>

      <Tabs value={aba} onValueChange={(valor) => setAbaEscolhida(valor as Aba)} className="gap-4">
        <div className="max-[560px]:-mx-4 max-[560px]:overflow-x-auto max-[560px]:px-4 max-[560px]:[scrollbar-width:none] max-[560px]:[&::-webkit-scrollbar]:hidden">
          <TabsList aria-label="Seções do Google" className="max-[560px]:w-max">
            {ABAS.map((item) => (
              <TabsTrigger key={item.valor} value={item.valor} className="px-4">
                {item.rotulo}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="perfis" id="perfis" className="scroll-mt-4">
          <PerfisNegocio locations={locations} lidoEm={lidoEm} aoTestar={testarLocal} />
        </TabsContent>

        <TabsContent value="ia">
          <RespostasIA locations={locations} localId={localId} aoMudarLocal={setLocalId} />
        </TabsContent>

        <TabsContent value="ga4" id="ga4" className="scroll-mt-4">
          <Ga4Resumo ga4={ga4} lidoEm={lidoEm} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
