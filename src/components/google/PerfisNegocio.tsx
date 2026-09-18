"use client";

import BadgeStatus from "@/components/sistema/Status";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import BotaoEvidencia from "@/components/hub-social/FolhaEvidencia";
import { Button } from "@/components/shadcn/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/shadcn/card";
import type { MappedLocation } from "@/lib/google-mybusiness";
import { notaComUmaCasa, OBSERVACAO_MEU_NEGOCIO, ORIGEM_MEU_NEGOCIO, ROTULO_TOM } from "./tons";

export type PerfisNegocioProps = {
  locations: MappedLocation[];
  lidoEm: string;
  aoTestar: (local: MappedLocation) => void;
};

function textoPendentes(quantidade: number) {
  return `${quantidade} ${quantidade === 1 ? "pendente" : "pendentes"}`;
}

export default function PerfisNegocio({ locations, lidoEm, aoTestar }: PerfisNegocioProps) {
  if (locations.length === 0) {
    return (
      <EstadoVazio
        titulo="Perfis do Google Meu Negócio sem fonte de dados"
        descricao="O Google não liberou a API do Business Profile para o projeto, e a Places API precisa de faturamento ativo. Assim que uma das duas funcionar, nota e avaliações reais aparecem aqui."
      />
    );
  }

  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))] max-[560px]:grid-cols-1">
      {locations.map((loc) => (
        <Card key={loc.id} className="gap-4 py-5">
          <CardHeader className="px-5">
            <CardTitle className="text-[17px] leading-tight min-[821px]:text-[15px]">{loc.name}</CardTitle>
            <CardDescription>
              {loc.category} · {loc.segment}
            </CardDescription>
            <CardAction className="-mt-2 -mr-2">
              <BotaoEvidencia
                rotulo={`Evidência de ${loc.name}`}
                evidencia={{
                  rotulo: loc.name,
                  origem: ORIGEM_MEU_NEGOCIO,
                  formula: "um item do array devolvido por listBusinessLocations()",
                  referencia: loc.id,
                  lidoEm,
                  observacao: OBSERVACAO_MEU_NEGOCIO,
                  bruto: loc,
                }}
              />
            </CardAction>
          </CardHeader>

          <CardContent className="flex flex-col gap-2 px-5">
            <div>
              <BadgeStatus status={loc.tone} texto={ROTULO_TOM[loc.tone]} tom="info" titulo={`Tom de voz: ${loc.tone}`} />
            </div>
            <p className="text-[13px] leading-[1.5] text-muted-foreground">{loc.address}</p>
          </CardContent>

          <CardFooter className="mt-auto flex-wrap justify-between gap-3 border-t px-5 [.border-t]:pt-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono font-semibold tabular-nums text-foreground">★ {notaComUmaCasa(loc.rating)}</span>
              <span className="text-muted-foreground">({loc.reviewCount.toLocaleString("pt-BR")} avaliações)</span>
              {loc.pendingReviews > 0 ? (
                <BadgeStatus status="pending" texto={textoPendentes(loc.pendingReviews)} tom="atencao" />
              ) : null}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => aoTestar(loc)}
              className="min-h-11 text-[15px] min-[821px]:min-h-8 min-[821px]:text-sm"
            >
              Testar resposta com IA
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
