"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import HealthEvidenceSheet, { type Evidence } from "@/components/health/HealthEvidenceSheet";
import { capacityLevel } from "@/lib/health/classify";
import { CAPACITY_LIMITS } from "@/lib/health/config";
import { sanitize, type AnyMeasurement, type ServiceView, type Snapshot } from "@/lib/health/schemas";
import "@/components/health/health-audit.css";

export type MonitoringData = Snapshot;
type Point = ServiceView["history"][number];

type RequestLog = {
  at: number;
  endpoint: string;
  requestId: string;
  httpStatus: number | null;
  durationMs: number;
  mode: string | null;
  error: string | null;
};

/**
 * Sparkline do histórico real (últimos 30 checks). Falha não vira "0 ms":
 * a linha quebra no ponto DOWN e ele aparece como marca vermelha na base.
 */
function Sparkline({ points }: { points: Point[] }) {
  if (points.length < 2) return <span className="health-no-history">aguardando histórico</span>;
  const values = points.map((p) => (p.status === "DOWN" ? null : p.latencyMs));
  const max = Math.max(500, ...values.filter((v): v is number => v !== null));
  const x = (i: number) => (i / (points.length - 1)) * 100;
  const segments: string[][] = [[]];
  values.forEach((value, i) => {
    if (value === null) {
      if (segments.at(-1)!.length) segments.push([]);
      return;
    }
    segments.at(-1)!.push(`${x(i)},${34 - (value / max) * 30}`);
  });
  return (
    <svg className="health-sparkline" viewBox="0 0 100 36" preserveAspectRatio="none" aria-label="Histórico de latência dos últimos checks">
      {segments.filter((s) => s.length > 1).map((s, i) => <polyline key={i} points={s.join(" ")} />)}
      {values.map((v, i) => (v === null ? <rect key={`d${i}`} className="health-spark-down" x={x(i) - 0.6} y={33} width={1.2} height={3} /> : null))}
    </svg>
  );
}

function ageText(iso: string | null, nowMs: number) {
  if (!iso) return "sem leitura";
  const seconds = Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 1000));
  return seconds < 60 ? `há ${seconds}s` : `há ${Math.floor(seconds / 60)}min`;
}

function isStale(m: AnyMeasurement, nowMs: number) {
  const ref = m.observedAt ?? m.receivedAt;
  return !ref || nowMs - new Date(ref).getTime() > m.reliability.staleAfterMs;
}

/** Número clicável: abre "Detalhes da medição" com a evidência dele. */
function Num({ m, titulo, valor, className, onOpen }: {
  m: AnyMeasurement; titulo: string; valor: string; className?: string;
  onOpen: (titulo: string, valor: string, m: AnyMeasurement) => void;
}) {
  return (
    <button
      type="button"
      className={`health-evidence ${className ?? ""}`}
      onClick={(event) => { event.stopPropagation(); onOpen(titulo, valor, m); }}
      title="Ver de onde vem este dado"
    >
      {valor}
    </button>
  );
}

function onActivate(handler: () => void) {
  return (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handler();
    }
  };
}

export default function RealtimeHealthDashboard({
  initialData,
  podeInspecionar,
  debugInicial,
}: {
  initialData: MonitoringData;
  podeInspecionar: boolean;
  debugInicial: boolean;
}) {
  const [data, setData] = useState(initialData);
  // Diferença entre o relógio do servidor e o do navegador. As idades usam o
  // relógio do servidor, o mesmo que carimbou as medições.
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [renderedAt, setRenderedAt] = useState(() => new Date(initialData.meta.generatedAt).getTime());
  const [now, setNow] = useState(() => new Date(initialData.meta.generatedAt).getTime());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [inspecting, setInspecting] = useState(podeInspecionar && debugInicial);
  const [requests, setRequests] = useState<RequestLog[]>([]);
  const requestInFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (document.visibilityState !== "visible" || requestInFlight.current) return;
    requestInFlight.current = true;
    setLoading(true);
    const endpoint = "/api/monitoring/live?refresh=1";
    const started = performance.now();
    let log: RequestLog = { at: Date.now(), endpoint, requestId: "-", httpStatus: null, durationMs: 0, mode: null, error: null };
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      log = { ...log, httpStatus: response.status, requestId: response.headers.get("x-request-id") ?? "-" };
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Falha ao medir aplicações.");
      const snapshot = payload as Snapshot;
      const received = Date.now();
      setClockOffsetMs(new Date(snapshot.meta.generatedAt).getTime() - received);
      setRenderedAt(received);
      setData(snapshot);
      setError("");
      log = { ...log, mode: snapshot.meta.collection.mode };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao atualizar.";
      setError(message);
      log = { ...log, error: message };
    } finally {
      log = { ...log, durationMs: Math.round(performance.now() - started) };
      setRequests((prev) => [log, ...prev].slice(0, 12));
      requestInFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(refresh, 0);
    const probes = window.setInterval(refresh, 5_000);
    const seconds = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => { window.clearTimeout(first); window.clearInterval(probes); window.clearInterval(seconds); };
  }, [refresh]);

  const serverNow = now + clockOffsetMs;
  const s = data.summary;

  function open(titulo: string, valor: string, measurement: AnyMeasurement, service?: ServiceView) {
    setEvidence({
      titulo, valor, measurement, service,
      requestId: data.meta.requestId, endpoint: data.meta.endpoint, renderedAt, clockOffsetMs,
    });
  }

  const avg = s.averageLatency.value;
  return <div className="health-dashboard">
    <section className="health-hero">
      <div><span className="health-live-dot" /> monitoramento ao vivo</div>
      <strong>{s.down.value ? `${s.down.value} serviço${s.down.value > 1 ? "s" : ""} fora do ar` : s.slow.value ? "Operação estável, com atenção" : s.unknown.value ? "Sem leitura recente de parte dos serviços" : "Tudo funcionando"}</strong>
      <p>Com a tela aberta, pede medição a cada 5 segundos (rodadas com menos de 5 s são reaproveitadas). Sem ninguém olhando, o servidor mede a cada {data.meta.thresholds.collectIntervalMs / 1000} s. Toque em qualquer número para ver a evidência.</p>
      <button className="health-refresh" onClick={refresh} disabled={loading}>{loading ? "Medindo…" : "Medir agora"}</button>
    </section>

    <section className="health-summary" aria-label="Resumo">
      <div><span>Saudáveis</span><strong className="good"><Num onOpen={open} m={s.healthy} titulo="Serviços saudáveis" valor={String(s.healthy.value)} /></strong></div>
      <div><span>Com atenção</span><strong className="warning"><Num onOpen={open} m={s.slow} titulo="Serviços com atenção" valor={String(s.slow.value)} /></strong></div>
      <div><span>Indisponíveis</span><strong className="danger"><Num onOpen={open} m={s.down} titulo="Serviços indisponíveis" valor={String(s.down.value)} /></strong></div>
      <div><span>Resposta média</span><strong><Num onOpen={open} m={s.averageLatency} titulo="Resposta média" valor={avg === null ? "-" : `${avg} ms`} /></strong></div>
    </section>
    {s.unknown.value ? (
      <button type="button" className="health-unknown-note" onClick={() => open("Serviços sem leitura atual", String(s.unknown.value), s.unknown)}>
        {s.unknown.value} serviço{s.unknown.value > 1 ? "s" : ""} sem leitura atual (fora dos totais acima)
      </button>
    ) : null}

    {error ? <div className="health-error">A última atualização falhou: {error}</div> : null}

    {podeInspecionar ? (
      <div className="health-inspect-bar">
        <button type="button" className="secondary-button" onClick={() => setInspecting((v) => !v)}>
          {inspecting ? "Fechar inspeção" : "Inspecionar dados"}
        </button>
      </div>
    ) : null}

    {inspecting ? (
      <section className="health-section health-inspector" aria-label="Inspeção dos dados">
        <div className="health-section-title"><div><span>Modo de inspeção</span><h2>De onde veio esta tela</h2></div></div>
        <div className="health-inspector-body">
          <div className="evidence-row"><span>Endpoint</span><span className="mono">{data.meta.endpoint}</span></div>
          <div className="evidence-row"><span>Request id</span><span className="mono">{data.meta.requestId}</span></div>
          <div className="evidence-row"><span>Gerado em (servidor)</span><span className="mono">{data.meta.generatedAt}</span></div>
          <div className="evidence-row"><span>Recebido na tela</span><span className="mono">{new Date(renderedAt).toISOString()}</span></div>
          <div className="evidence-row"><span>Diferença de relógio</span><span className="mono">{clockOffsetMs} ms</span></div>
          <div className="evidence-row"><span>Duração no backend</span><span className="mono">{data.meta.durationMs} ms</span></div>
          <div className="evidence-row"><span>Coleta</span><span className="mono">{data.meta.collection.mode}: {data.meta.collection.note}</span></div>
          <div className="evidence-row"><span>Última rodada</span><span className="mono">{data.meta.collection.lastRoundAt ?? "-"}</span></div>
          <div className="evidence-row"><span>Backend</span><span className="mono">commit {data.meta.backend.commit} · {data.meta.backend.rulesVersion} · {data.meta.backend.probeVersion}</span></div>
          <div className="evidence-row"><span>Limites</span><span className="mono">{JSON.stringify(data.meta.thresholds)}</span></div>
          <h3>Últimas requisições desta tela</h3>
          <div className="evidence-checks">
            <table>
              <thead><tr><th>Hora</th><th>HTTP</th><th>ms</th><th>Coleta</th><th>Request id</th><th>Erro</th></tr></thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={`${r.at}-${r.requestId}`} className={r.error ? "down" : undefined}>
                    <td>{new Date(r.at).toLocaleTimeString("pt-BR")}</td><td>{r.httpStatus ?? "-"}</td><td>{r.durationMs}</td>
                    <td>{r.mode ?? "-"}</td><td className="mono">{r.requestId}</td><td>{r.error ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details>
            <summary>Resposta JSON (sanitizada)</summary>
            <pre className="evidence-json">{JSON.stringify(sanitize(data), null, 2)}</pre>
          </details>
        </div>
      </section>
    ) : null}

    <section className="health-section">
      <div className="health-section-title"><div><span>Infraestrutura</span><h2>Capacidade dos servidores</h2></div><small>leituras enviadas pelo próprio host</small></div>
      <div className="health-server-grid">
        {data.servers.map((server) => {
          const stale = isStale(server.cpu, serverNow);
          return <article className="health-server" key={server.key}>
            <header>
              <div><span className={`health-state ${server.containers.unhealthy.value ? "danger" : "good"}`} /> <strong>{server.name}</strong></div>
              <small>
                {stale ? <em className="health-stale">DADO DESATUALIZADO</em> : null}
                <Num onOpen={open} m={server.cpu} titulo={`Horário da leitura · ${server.name}`} valor={ageText(server.cpu.observedAt ?? server.cpu.receivedAt, serverNow)} className="health-age" />
              </small>
            </header>
            <div className="health-gauges">
              {[
                { label: "CPU", m: server.cpu, cls: capacityLevel(server.cpu.value, CAPACITY_LIMITS.cpu) },
                { label: "Memória", m: server.memory, cls: capacityLevel(server.memory.value, CAPACITY_LIMITS.memory) },
                { label: "Disco", m: server.disk, cls: capacityLevel(server.disk.value, CAPACITY_LIMITS.disk) },
              ].map((g) => <div key={g.label}>
                <span>{g.label}<b><Num onOpen={open} m={g.m} titulo={`${g.label} · ${server.name}`} valor={`${g.m.value.toFixed(0)}%`} /></b></span>
                <i><em className={g.cls} style={{ width: `${Math.min(100, g.m.value)}%` }} /></i>
              </div>)}
            </div>
            <footer>
              <Num onOpen={open} m={server.memoryAvailableMb} titulo={`Memória livre · ${server.name}`} valor={`${server.memoryAvailableMb.value} MB livres`} />
              <Num onOpen={open} m={server.swap} titulo={`Swap · ${server.name}`} valor={`swap ${server.swap.value.toFixed(0)}%`} />
              <Num onOpen={open} m={server.containers.running} titulo={`Containers em execução · ${server.name}`} valor={`${server.containers.running.value} containers rodando`} />
            </footer>
            <div className="health-containers">
              <Num onOpen={open} m={server.containers.stopped} titulo={`Containers parados · ${server.name}`} valor={server.containers.stopped.value === null ? "parados: sem dado" : `${server.containers.stopped.value} parados`} />
              <Num onOpen={open} m={server.containers.unhealthy} titulo={`Containers unhealthy · ${server.name}`} valor={`${server.containers.unhealthy.value} unhealthy`} />
              <Num onOpen={open} m={server.containers.total} titulo={`Containers existentes · ${server.name}`} valor={server.containers.total.value === null ? "total: sem dado" : `${server.containers.total.value} existentes`} />
            </div>
          </article>;
        })}
        {!data.servers.length ? <div className="health-empty">Os coletores dos servidores ainda não enviaram a primeira leitura.</div> : null}
      </div>
    </section>

    {(["apps-noclient", "apps-client"] as const).map((serverKey) => <section className="health-section" key={serverKey}>
      <div className="health-section-title"><div><span>{serverKey === "apps-noclient" ? "Servidor de automação" : "Servidor de aplicações"}</span><h2>{serverKey === "apps-noclient" ? "n8n e ferramentas internas" : "Produtos e sites em produção"}</h2></div></div>
      <div className="health-service-list">{data.services.filter((svc) => svc.declaredServer === serverKey).map((service) => {
        const status = service.status.value;
        const stale = isStale(service.status, serverNow);
        const hostMismatch = service.check.hosting.kind === "external" || (service.check.hosting.kind === "server" && service.check.hosting.serverKey !== service.declaredServer);
        const abrir = () => open(service.name, status, service.status, service);
        return <article className="health-service health-service-clickable" key={service.key} role="button" tabIndex={0} onClick={abrir} onKeyDown={onActivate(abrir)} aria-label={`Ver detalhes da medição de ${service.name}`}>
          <div className={`health-orb ${stale ? "unknown" : status.toLowerCase()}`}><span /></div>
          <div className="health-service-name">
            <strong>{service.name}</strong>
            <small>{status === "HEALTHY" ? "Operando normalmente" : status === "SLOW" ? "Resposta acima de 2,5 s" : status === "UNKNOWN" ? "Sem leitura" : service.check.errorCode ?? `HTTP ${service.check.httpStatus ?? "-"}`}</small>
            {hostMismatch ? <small className="health-host-warning">DNS aponta para fora deste servidor</small> : null}
          </div>
          <Sparkline points={service.history} />
          <div className="health-latency" aria-live="polite">
            <strong>{service.latency.value === null ? "-" : service.latency.value < 1000 ? `${service.latency.value} ms` : `${(service.latency.value / 1000).toFixed(2)} s`}</strong>
            <small>{stale ? <em className="health-stale">DESATUALIZADO</em> : null} {ageText(service.check.checkedAt, serverNow)}</small>
          </div>
        </article>;
      })}</div>
    </section>)}

    {evidence ? <HealthEvidenceSheet evidence={evidence} aoFechar={() => setEvidence(null)} /> : null}
  </div>;
}
