"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import HealthEvidenceSheet, { type Evidence } from "@/components/health/HealthEvidenceSheet";
import { Grupo, LinhaDobravel, LinhaInfo } from "@/components/sistema/Lista";
import BadgeStatus from "@/components/sistema/Status";
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

function ms(valor: number | null) {
  if (valor === null) return "—";
  return valor < 1000 ? `${valor} ms` : `${(valor / 1000).toFixed(2)} s`;
}

/**
 * Número clicável: abre "Detalhes da medição" com a evidência dele.
 *
 * Todo número desta tela é um botão porque nenhum deles se explica sozinho —
 * "42 ms" sem dizer quem mediu, quando e como é palpite com cara de dado.
 */
function Num({ m, titulo, valor, onOpen }: {
  m: AnyMeasurement; titulo: string; valor: string;
  onOpen: (titulo: string, valor: string, m: AnyMeasurement) => void;
}) {
  return (
    <button
      type="button"
      className="health-evidence"
      onClick={(event) => { event.stopPropagation(); onOpen(titulo, valor, m); }}
      title="Ver de onde vem este dado"
    >
      {valor}
    </button>
  );
}

/** Barra fina de ocupação. Cor pelo mesmo `capacityLevel` do backend. */
function Barra({ valor, limites }: { valor: number; limites: { warning: number; critical: number } }) {
  return (
    <i className="health-barra" aria-hidden="true">
      <em className={capacityLevel(valor, limites)} style={{ width: `${Math.min(100, valor)}%` }} />
    </i>
  );
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

  const veredito = s.down.value
    ? `${s.down.value} serviço${s.down.value > 1 ? "s" : ""} indisponível${s.down.value > 1 ? "eis" : ""}`
    : s.slow.value
      ? "Operação degradada"
      : s.unknown.value
        ? "Sem leitura de parte dos serviços"
        : "Tudo funcionando";
  const tomVeredito = s.down.value ? "down" : s.slow.value ? "slow" : s.unknown.value ? "unknown" : "healthy";

  return (
    <div className="pilha">
      <Grupo>
        <LinhaInfo
          titulo={veredito}
          descricao={
            loading
              ? "Medindo agora…"
              : `Com a tela aberta, mede a cada 5 s. Sem ninguém olhando, a cada ${data.meta.thresholds.collectIntervalMs / 1000} s.`
          }
          valor={<BadgeStatus status={tomVeredito} />}
        />
        {error ? (
          <LinhaInfo
            titulo="A última atualização falhou"
            descricao={`${error} Os números abaixo são da leitura anterior, ${ageText(data.meta.generatedAt, serverNow)}.`}
            valor={<BadgeStatus status="error" />}
          />
        ) : null}
        <div className="linha linha-estatica">
          <span className="linha-texto">
            <strong>Medir agora</strong>
            <small>Toque em qualquer número para ver de onde ele veio.</small>
          </span>
          <button type="button" className="secondary-button" onClick={refresh} disabled={loading}>
            {loading ? "Medindo…" : "Medir"}
          </button>
        </div>
      </Grupo>

      <div className="servicos-resumo" role="group" aria-label="Resumo dos serviços">
        <div>
          <span>Saudáveis</span>
          <strong><Num onOpen={open} m={s.healthy} titulo="Serviços saudáveis" valor={String(s.healthy.value)} /></strong>
        </div>
        <div>
          <span>Degradados</span>
          <strong><Num onOpen={open} m={s.slow} titulo="Serviços degradados" valor={String(s.slow.value)} /></strong>
        </div>
        <div>
          <span>Indisponíveis</span>
          <strong><Num onOpen={open} m={s.down} titulo="Serviços indisponíveis" valor={String(s.down.value)} /></strong>
        </div>
        <div>
          <span>Desconhecidos</span>
          <strong><Num onOpen={open} m={s.unknown} titulo="Serviços sem leitura atual" valor={String(s.unknown.value)} /></strong>
        </div>
        <div>
          <span>Resposta média</span>
          <strong><Num onOpen={open} m={s.averageLatency} titulo="Resposta média" valor={ms(s.averageLatency.value)} /></strong>
        </div>
      </div>

      <Grupo titulo="Capacidade dos servidores">
        {data.servers.map((server) => {
          const desatualizado = isStale(server.cpu, serverNow);
          return (
            <LinhaDobravel
              key={server.key}
              titulo={server.name}
              descricao={
                desatualizado
                  ? `leitura ${ageText(server.cpu.observedAt ?? server.cpu.receivedAt, serverNow)}, fora da janela`
                  : `CPU ${server.cpu.value.toFixed(0)}% · memória ${server.memory.value.toFixed(0)}% · disco ${server.disk.value.toFixed(0)}%`
              }
              valor={
                <BadgeStatus
                  status={desatualizado ? "unknown" : server.containers.unhealthy.value ? "degraded" : "healthy"}
                />
              }
            >
              {[
                { rotulo: "CPU", m: server.cpu, limites: CAPACITY_LIMITS.cpu },
                { rotulo: "Memória", m: server.memory, limites: CAPACITY_LIMITS.memory },
                { rotulo: "Disco", m: server.disk, limites: CAPACITY_LIMITS.disk },
              ].map((g) => (
                <div key={g.rotulo}>
                  <span className="rotulo">{g.rotulo}</span>
                  <span className="valor">
                    <Num onOpen={open} m={g.m} titulo={`${g.rotulo} · ${server.name}`} valor={`${g.m.value.toFixed(0)}%`} />
                    <Barra valor={g.m.value} limites={g.limites} />
                  </span>
                </div>
              ))}
              <div>
                <span className="rotulo">Memória livre</span>
                <span className="valor">
                  <Num onOpen={open} m={server.memoryAvailableMb} titulo={`Memória livre · ${server.name}`} valor={`${server.memoryAvailableMb.value} MB`} />
                </span>
              </div>
              <div>
                <span className="rotulo">Swap</span>
                <span className="valor">
                  <Num onOpen={open} m={server.swap} titulo={`Swap · ${server.name}`} valor={`${server.swap.value.toFixed(0)}%`} />
                </span>
              </div>
              <div>
                <span className="rotulo">Containers</span>
                <span className="valor">
                  <Num onOpen={open} m={server.containers.running} titulo={`Containers em execução · ${server.name}`} valor={`${server.containers.running.value} rodando`} />
                </span>
              </div>
              <div>
                <span className="rotulo">Parados</span>
                <span className="valor">
                  <Num onOpen={open} m={server.containers.stopped} titulo={`Containers parados · ${server.name}`} valor={server.containers.stopped.value === null ? "sem dado" : String(server.containers.stopped.value)} />
                </span>
              </div>
              <div>
                <span className="rotulo">Unhealthy</span>
                <span className="valor">
                  <Num onOpen={open} m={server.containers.unhealthy} titulo={`Containers unhealthy · ${server.name}`} valor={String(server.containers.unhealthy.value)} />
                </span>
              </div>
              <div>
                <span className="rotulo">Leitura</span>
                <span className="valor">
                  <Num onOpen={open} m={server.cpu} titulo={`Horário da leitura · ${server.name}`} valor={ageText(server.cpu.observedAt ?? server.cpu.receivedAt, serverNow)} />
                </span>
              </div>
            </LinhaDobravel>
          );
        })}
        {!data.servers.length ? (
          <LinhaInfo
            titulo="Sem leitura dos servidores"
            descricao="Os coletores ainda não enviaram a primeira medição. Nada aqui é estimado."
            valor={<BadgeStatus status="unknown" />}
          />
        ) : null}
      </Grupo>

      {(["apps-noclient", "apps-client"] as const).map((serverKey) => {
        const servicos = data.services.filter((svc) => svc.declaredServer === serverKey);
        const titulo = serverKey === "apps-noclient" ? "Automação e ferramentas internas" : "Produtos e sites em produção";
        return (
          <Grupo titulo={titulo} key={serverKey}>
            {servicos.map((service) => {
              const status = service.status.value;
              const desatualizado = isStale(service.status, serverNow);
              const foraDoServidor =
                service.check.hosting.kind === "external" ||
                (service.check.hosting.kind === "server" && service.check.hosting.serverKey !== service.declaredServer);
              const explicacao = desatualizado
                ? "Sem leitura dentro da janela"
                : status === "HEALTHY"
                  ? `Respondeu em ${ms(service.latency.value)}`
                  : status === "SLOW"
                    ? `Lento: ${ms(service.latency.value)}`
                    : status === "UNKNOWN"
                      ? "Nunca foi medido"
                      : (service.check.errorCode ?? `HTTP ${service.check.httpStatus ?? "—"}`);
              return (
                <LinhaDobravel
                  key={service.key}
                  titulo={service.name}
                  descricao={foraDoServidor ? `${explicacao} · DNS aponta para fora deste servidor` : explicacao}
                  valor={<BadgeStatus status={desatualizado ? "unknown" : status.toLowerCase()} />}
                >
                  <div>
                    <span className="rotulo">Resposta</span>
                    <span className="valor">
                      <Num onOpen={open} m={service.latency} titulo={`Resposta · ${service.name}`} valor={ms(service.latency.value)} />
                    </span>
                  </div>
                  <div>
                    <span className="rotulo">Medido</span>
                    <span className="valor">
                      <Num onOpen={open} m={service.status} titulo={`Estado · ${service.name}`} valor={ageText(service.check.checkedAt, serverNow)} />
                    </span>
                  </div>
                  <div>
                    <span className="rotulo">Endereço</span>
                    <span className="valor font-mono">{service.check.hostname}</span>
                  </div>
                  <div>
                    <span className="rotulo">Hospedagem</span>
                    <span className="valor">{service.check.hosting.detail}</span>
                  </div>
                  <div>
                    <span className="rotulo">DNS / TCP / TLS</span>
                    <span className="valor font-mono">
                      {service.check.timings.dnsMs ?? "—"} / {service.check.timings.connectMs ?? "—"} / {service.check.timings.tlsMs ?? "—"} ms
                    </span>
                  </div>
                  <div>
                    <span className="rotulo">Últimos checks</span>
                    <span className="valor"><Sparkline points={service.history} /></span>
                  </div>
                  <div className="dobra-largura">
                    <div className="dobra-acoes">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => open(service.name, status, service.status, service)}
                      >
                        Detalhes da medição
                      </button>
                    </div>
                  </div>
                </LinhaDobravel>
              );
            })}
            {!servicos.length ? (
              <LinhaInfo titulo="Nenhum serviço declarado aqui" descricao="A lista vem de src/lib/health/config.ts." />
            ) : null}
          </Grupo>
        );
      })}

      {podeInspecionar ? (
        <Grupo titulo="Inspeção">
          <div className="linha linha-estatica">
            <span className="linha-texto">
              <strong>De onde veio esta tela</strong>
              <small>Request id, relógios, versões e a resposta crua.</small>
            </span>
            <button type="button" className="secondary-button" onClick={() => setInspecting((v) => !v)}>
              {inspecting ? "Fechar" : "Abrir"}
            </button>
          </div>
          {inspecting ? (
            <div className="linha-dobra">
              <div><span className="rotulo">Endpoint</span><span className="valor font-mono">{data.meta.endpoint}</span></div>
              <div><span className="rotulo">Request id</span><span className="valor font-mono">{data.meta.requestId}</span></div>
              <div><span className="rotulo">Gerado em (servidor)</span><span className="valor font-mono">{data.meta.generatedAt}</span></div>
              <div><span className="rotulo">Recebido na tela</span><span className="valor font-mono">{new Date(renderedAt).toISOString()}</span></div>
              <div><span className="rotulo">Diferença de relógio</span><span className="valor font-mono">{clockOffsetMs} ms</span></div>
              <div><span className="rotulo">Duração no backend</span><span className="valor font-mono">{data.meta.durationMs} ms</span></div>
              <div><span className="rotulo">Coleta</span><span className="valor">{data.meta.collection.mode}: {data.meta.collection.note}</span></div>
              <div><span className="rotulo">Última rodada</span><span className="valor font-mono">{data.meta.collection.lastRoundAt ?? "—"}</span></div>
              <div><span className="rotulo">Backend</span><span className="valor font-mono">commit {data.meta.backend.commit} · {data.meta.backend.rulesVersion} · {data.meta.backend.probeVersion}</span></div>
              <div className="dobra-largura">
                <details className="detalhes-tecnicos">
                  <summary>Últimas requisições desta tela</summary>
                  <ul>
                    {requests.map((r) => (
                      <li key={`${r.at}-${r.requestId}`}>
                        {new Date(r.at).toISOString().slice(11, 19)} · HTTP {r.httpStatus ?? "—"} · {r.durationMs} ms · {r.mode ?? "—"} · {r.requestId}
                        {r.error ? ` · ${r.error}` : ""}
                      </li>
                    ))}
                    {!requests.length ? <li>nenhuma ainda</li> : null}
                  </ul>
                </details>
                <details className="detalhes-tecnicos">
                  <summary>Resposta JSON (sanitizada)</summary>
                  <pre className="evidence-json">{JSON.stringify(sanitize(data), null, 2)}</pre>
                </details>
              </div>
            </div>
          ) : null}
        </Grupo>
      ) : null}

      {evidence ? <HealthEvidenceSheet evidence={evidence} aoFechar={() => setEvidence(null)} /> : null}
    </div>
  );
}
