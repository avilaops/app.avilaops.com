"use client";

import { useState, type FormEvent } from "react";
import BadgeStatus from "@/components/sistema/Status";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import { Button } from "@/components/shadcn/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shadcn/card";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { Textarea } from "@/components/shadcn/textarea";
import type { MappedLocation } from "@/lib/google-mybusiness";
import { ROTULO_TOM } from "./tons";

export type RespostasIAProps = {
  locations: MappedLocation[];
  localId: string;
  aoMudarLocal: (id: string) => void;
};

const NOTAS = [
  { valor: "5", rotulo: "5 — Excelente" },
  { valor: "4", rotulo: "4 — Muito bom" },
  { valor: "3", rotulo: "3 — Regular" },
  { valor: "2", rotulo: "2 — Insatisfeito" },
  { valor: "1", rotulo: "1 — Péssimo" },
];

const classesCampo = "min-h-12 text-base min-[821px]:min-h-9 min-[821px]:text-sm";

export default function RespostasIA({ locations, localId, aoMudarLocal }: RespostasIAProps) {
  const [nomeAvaliador, setNomeAvaliador] = useState("");
  const [nota, setNota] = useState("5");
  const [comentario, setComentario] = useState("");
  const [resposta, setResposta] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const local = locations.find((l) => l.id === localId) ?? locations[0];
  const podeGerar = Boolean(local) && comentario.trim().length > 0 && !gerando;

  async function gerar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!local || !podeGerar) return;
    setGerando(true);
    setErro(null);
    setResposta(null);
    try {
      const res = await fetch("/api/google/my-business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate_reply",
          locationName: local.name,
          reviewerName: nomeAvaliador,
          rating: Number(nota),
          comment: comentario,
          tone: local.tone,
        }),
      });
      const dados = await res.json();
      if (!res.ok || typeof dados.reply !== "string") {
        throw new Error(typeof dados.error === "string" ? dados.error : "Não deu para gerar a resposta.");
      }
      setResposta(dados.reply);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu para gerar a resposta.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <CardTitle className="text-[17px] leading-tight min-[821px]:text-[15px]">Resposta a avaliações</CardTitle>
        <CardDescription>Escolha o local e simule uma avaliação; a resposta sai no tom de voz da marca.</CardDescription>
      </CardHeader>

      <CardContent className="grid gap-6 px-5 min-[821px]:grid-cols-2">
        <form onSubmit={gerar} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ia-local">Local</Label>
            <Select value={local?.id ?? ""} onValueChange={aoMudarLocal} disabled={locations.length === 0}>
              <SelectTrigger id="ia-local" className={`w-full ${classesCampo}`}>
                <SelectValue placeholder="Escolha o local" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="ia-nome">Nome de quem avaliou</Label>
            <Input
              id="ia-nome"
              value={nomeAvaliador}
              onChange={(e) => setNomeAvaliador(e.target.value)}
              placeholder="Como aparece no Google"
              autoComplete="off"
              className={classesCampo}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="ia-nota">Nota</Label>
            <Select value={nota} onValueChange={setNota}>
              <SelectTrigger id="ia-nota" className={`w-full ${classesCampo}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTAS.map((n) => (
                  <SelectItem key={n.valor} value={n.valor}>
                    {n.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="ia-comentario">Comentário</Label>
            <Textarea
              id="ia-comentario"
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Cole aqui o texto da avaliação"
              rows={4}
              className="min-h-28 text-base min-[821px]:text-sm"
            />
          </div>

          <Button
            type="submit"
            disabled={!podeGerar}
            className="min-h-[50px] self-stretch px-5 text-[15px] min-[821px]:min-h-9 min-[821px]:self-start min-[821px]:text-sm"
          >
            {gerando ? "Gerando…" : "Gerar resposta"}
          </Button>

          {erro ? (
            <p role="alert" className="text-sm text-[color:var(--red)]">
              {erro}
            </p>
          ) : null}
        </form>

        <div className="min-w-0">
          {resposta && local ? (
            <Card className="gap-3 bg-muted/40 py-4 shadow-none">
              <CardHeader className="px-4">
                <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-medium text-muted-foreground">
                  Tom de voz:
                  <BadgeStatus status={local.tone} texto={ROTULO_TOM[local.tone]} tom="info" />
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4">
                <p className="whitespace-pre-wrap text-[15px] leading-[1.6] text-foreground">{resposta}</p>
              </CardContent>
            </Card>
          ) : (
            <EstadoVazio compacto titulo="Preencha a avaliação e gere uma resposta no tom da marca." />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
