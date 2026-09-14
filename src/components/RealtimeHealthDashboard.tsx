"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Point = { latencyMs: number | null; status: string; at: string };
type Service = { key: string; name: string; server: string; url: string; status: string; statusCode: number | null; latencyMs: number | null; errorCode: string | null; checkedAt: string | null; history: Point[] };
type Server = { id: string; serverKey: string; serverName: string; cpuPercent: number; memoryUsedPercent: number; memoryAvailableMb: number; swapUsedPercent: number; diskUsedPercent: number; load1: number; containersRunning: number; containersUnhealthy: number; collectedAt: string };
export type MonitoringData = { generatedAt: string; services: Service[]; servers: Server[] };

function Sparkline({ points }: { points: Point[] }) {
  const values = points.map((p) => p.latencyMs ?? 0);
  if (values.length < 2) return <span className="health-no-history">aguardando histórico</span>;
  const max = Math.max(500, ...values);
  const coords = values.map((value, index) => `${(index / (values.length - 1)) * 100},${34 - (value / max) * 30}`).join(" ");
  return <svg className="health-sparkline" viewBox="0 0 100 36" preserveAspectRatio="none" aria-label="Histórico de latência"><polyline points={coords} /></svg>;
}

function age(iso: string | null, referenceTime: number) {
  if (!iso) return "sem leitura";
  const seconds = Math.max(0, Math.floor((referenceTime - new Date(iso).getTime()) / 1000));
  return seconds < 60 ? `há ${seconds}s` : `há ${Math.floor(seconds / 60)}min`;
}

function metricClass(value: number, warning: number, critical: number) {
  return value >= critical ? "danger" : value >= warning ? "warning" : "good";
}

export default function RealtimeHealthDashboard({ initialData }: { initialData: MonitoringData }) {
  const [data, setData] = useState(initialData);
  const [clock, setClock] = useState(() => new Date(initialData.generatedAt).getTime());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestInFlight = useRef(false);
  const refresh = useCallback(async () => {
    if (document.visibilityState !== "visible" || requestInFlight.current) return;
    requestInFlight.current = true;
    setLoading(true);
    try {
      const response = await fetch("/api/monitoring/live?refresh=1", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Falha ao medir aplicações.");
      setData(payload);
      setClock(new Date(payload.generatedAt).getTime());
      setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao atualizar."); }
    finally { requestInFlight.current = false; setLoading(false); }
  }, []);
  useEffect(() => {
    const first = window.setTimeout(refresh, 0);
    const probes = window.setInterval(refresh, 5_000);
    const seconds = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => { window.clearTimeout(first); window.clearInterval(probes); window.clearInterval(seconds); };
  }, [refresh]);

  const totals = useMemo(() => ({
    healthy: data.services.filter((s) => s.status === "HEALTHY").length,
    slow: data.services.filter((s) => s.status === "SLOW").length,
    down: data.services.filter((s) => s.status === "DOWN").length,
    avg: Math.round(data.services.reduce((sum, s) => sum + (s.latencyMs ?? 0), 0) / Math.max(1, data.services.filter((s) => s.latencyMs !== null).length)),
  }), [data]);

  return <div className="health-dashboard">
    <section className="health-hero">
      <div><span className="health-live-dot" /> monitoramento ao vivo</div>
      <strong>{totals.down ? `${totals.down} serviço${totals.down > 1 ? "s" : ""} fora do ar` : totals.slow ? "Operação estável, com atenção" : "Tudo funcionando"}</strong>
      <p>Leituras contínuas a cada 5 segundos enquanto você acompanha. O contador avança a cada segundo.</p>
      <button className="health-refresh" onClick={refresh} disabled={loading}>{loading ? "Medindo…" : "Medir agora"}</button>
    </section>

    <section className="health-summary" aria-label="Resumo">
      <div><span>Saudáveis</span><strong className="good">{totals.healthy}</strong></div>
      <div><span>Com atenção</span><strong className="warning">{totals.slow}</strong></div>
      <div><span>Indisponíveis</span><strong className="danger">{totals.down}</strong></div>
      <div><span>Resposta média</span><strong>{totals.avg} ms</strong></div>
    </section>

    {error ? <div className="health-error">A última atualização falhou: {error}</div> : null}

    <section className="health-section">
      <div className="health-section-title"><div><span>Infraestrutura</span><h2>Capacidade dos servidores</h2></div><small>leituras enviadas pelo próprio host</small></div>
      <div className="health-server-grid">
        {data.servers.map((server) => <article className="health-server" key={server.serverKey}>
          <header><div><span className={`health-state ${server.containersUnhealthy ? "danger" : "good"}`} /> <strong>{server.serverName}</strong></div><small>{age(server.collectedAt, clock)}</small></header>
          <div className="health-gauges">
            {[{ label: "CPU", value: server.cpuPercent, cls: metricClass(server.cpuPercent, 70, 90) }, { label: "Memória", value: server.memoryUsedPercent, cls: metricClass(server.memoryUsedPercent, 75, 90) }, { label: "Disco", value: server.diskUsedPercent, cls: metricClass(server.diskUsedPercent, 75, 90) }].map((m) => <div key={m.label}><span>{m.label}<b>{m.value.toFixed(0)}%</b></span><i><em className={m.cls} style={{ width: `${Math.min(100, m.value)}%` }} /></i></div>)}
          </div>
          <footer><span>{server.memoryAvailableMb} MB livres</span><span>swap {server.swapUsedPercent.toFixed(0)}%</span><span>{server.containersRunning} containers</span></footer>
        </article>)}
        {!data.servers.length ? <div className="health-empty">Os coletores dos servidores ainda não enviaram a primeira leitura.</div> : null}
      </div>
    </section>

    {(["apps-noclient", "apps-client"] as const).map((serverKey) => <section className="health-section" key={serverKey}>
      <div className="health-section-title"><div><span>{serverKey === "apps-noclient" ? "Servidor de automação" : "Servidor de aplicações"}</span><h2>{serverKey === "apps-noclient" ? "n8n e ferramentas internas" : "Produtos e sites em produção"}</h2></div></div>
      <div className="health-service-list">{data.services.filter((s) => s.server === serverKey).map((service) => <article className="health-service" key={service.key}>
        <div className={`health-orb ${service.status.toLowerCase()}`}><span /></div>
        <div className="health-service-name"><strong>{service.name}</strong><small>{service.status === "HEALTHY" ? "Operando normalmente" : service.status === "SLOW" ? "Resposta acima de 2,5 s" : service.errorCode ?? `HTTP ${service.statusCode ?? "-"}`}</small></div>
        <Sparkline points={service.history} />
        <div className="health-latency" aria-live="polite"><strong>{service.latencyMs === null ? "-" : service.latencyMs < 1000 ? `${service.latencyMs} ms` : `${(service.latencyMs / 1000).toFixed(2)} s`}</strong><small>{age(service.checkedAt, clock)}</small></div>
      </article>)}</div>
    </section>)}
  </div>;
}
