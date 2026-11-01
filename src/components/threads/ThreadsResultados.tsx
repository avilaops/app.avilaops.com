"use client";
import { useState } from "react";
import { Button } from "@/components/shadcn/button";

type Insights = { since: string; until: string; readAt: string; metrics: { name: string; period: string | null; total: number | null; values: { value: number; endTime: string | null }[] }[] };
const names: Record<string, string> = { views: "Visualizações", likes: "Curtidas", replies: "Respostas", reposts: "Republicações", quotes: "Citações" };

export default function ThreadsResultados({ organizationId, enabled }: { organizationId: string; enabled: boolean }) {
  const [result, setResult] = useState<Insights | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch(`/api/integrations/threads/insights?${new URLSearchParams({ organizationId })}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Métricas indisponíveis.");
      setResult(data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível consultar."); }
    finally { setBusy(false); }
  }
  return <section className="rounded-xl border border-border p-4 space-y-3" aria-label="Resultados do Threads">
    <h2 className="font-semibold">Resultados do Threads</h2>
    <p className="text-sm text-muted-foreground">Consulte os resultados da conta desta empresa. A consulta solicita sete dias e preserva o período informado pela Meta para cada métrica.</p>
    <Button onClick={load} disabled={!enabled || busy} variant="outline">{busy ? "Consultando…" : "Consultar resultados"}</Button>
    {!enabled && <p className="text-sm">Conecte o Threads e conceda acesso às métricas para consultar os resultados.</p>}
    {error && <p role="alert" className="text-sm">{error}</p>}
    {result && <div className="space-y-2 text-sm">
      <p>Período solicitado: {new Date(result.since).toLocaleString("pt-BR")} a {new Date(result.until).toLocaleString("pt-BR")}. Consultado em {new Date(result.readAt).toLocaleString("pt-BR")}.</p>
      {!result.metrics.length && <p>A Meta não retornou métricas para este período.</p>}
      {result.metrics.map(metric => <div key={metric.name}>
        <strong>{names[metric.name] || metric.name}</strong>
        {metric.period && <span> · período informado pela Meta: {metric.period}</span>}
        {metric.total !== null && <p>Total informado: {metric.total.toLocaleString("pt-BR")}</p>}
        {metric.values.map((value, index) => <p key={index}>{value.endTime ? new Date(value.endTime).toLocaleDateString("pt-BR") : "Valor informado"}: {value.value.toLocaleString("pt-BR")}</p>)}
        {metric.total === null && !metric.values.length && <p>Sem valor informado.</p>}
      </div>)}
    </div>}
  </section>;
}
