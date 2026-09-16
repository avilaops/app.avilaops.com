"use client";

import { useEffect, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import type { AnyMeasurement, ServiceView } from "@/lib/health/schemas";

/**
 * "Detalhes da medição": responde, para qualquer número da tela, qual
 * evidência o produziu. Mostra só o que veio na resposta da API; o que a API
 * não tem aparece como "não informado", nunca preenchido aqui.
 */

export type Evidence = {
  titulo: string;
  valor: string;
  measurement: AnyMeasurement;
  service?: ServiceView;
  requestId: string;
  endpoint: string;
  renderedAt: number;
  clockOffsetMs: number;
};

type ServiceDetail = {
  consecutiveFailures: number;
  lastFailureAt: string | null;
  lastRecoveryAt: string | null;
  failingSince: string | null;
  checksAnalyzed: number;
  retentionMs: number;
  requestId: string;
  recentChecks: {
    id: string; checkedAt: string; status: string; httpStatus: number | null; latencyMs: number | null;
    errorCode: string | null; errorCategory: string | null; resolvedIp: string | null; trigger: string | null; requestId: string | null;
  }[];
};

const fmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
  fractionalSecondDigits: 3, timeZone: "America/Sao_Paulo",
});

function quando(iso: string | null) {
  return iso ? fmt.format(new Date(iso)) : "não informado";
}

function idade(ms: number | null) {
  if (ms === null) return "não calculável";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1).replace(".", ",")} segundos`;
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}

const ROTULO_ESTADO: Record<string, string> = {
  live: "LIVE", stale: "STALE", missing: "SEM DADO", estimated: "ESTIMADO", cache: "CACHE", fallback: "FALLBACK", mock: "MOCK",
};

function Linha({ rotulo, children, mono }: { rotulo: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="evidence-row">
      <span>{rotulo}</span>
      <span className={mono ? "mono" : undefined}>{children}</span>
    </div>
  );
}

export default function HealthEvidenceSheet({ evidence, aoFechar }: { evidence: Evidence; aoFechar: () => void }) {
  const { measurement: m, service } = evidence;
  const [agora, setAgora] = useState(() => Date.now());
  const [detalhe, setDetalhe] = useState<ServiceDetail | null>(null);
  const [erroDetalhe, setErroDetalhe] = useState("");
  const [json, setJson] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!service) return;
    let vivo = true;
    fetch(`/api/monitoring/services/${service.key}`, { cache: "no-store" })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
        if (vivo) setDetalhe(body as ServiceDetail);
      })
      .catch((e: unknown) => vivo && setErroDetalhe(e instanceof Error ? e.message : "falha"));
    return () => { vivo = false; };
  }, [service]);

  // Idade contada pela hora da medição, no relógio do servidor (offset), e não
  // pela hora em que a tela buscou os dados.
  const referencia = m.observedAt ?? m.receivedAt;
  const idadeMs = referencia ? Math.max(0, agora + evidence.clockOffsetMs - new Date(referencia).getTime()) : null;
  const estado = idadeMs !== null && idadeMs > m.reliability.staleAfterMs ? "stale" : m.reliability.state;
  const rawEntries = Object.entries(m.raw);

  return (
    <Sheet titulo="Detalhes da medição" aoFechar={aoFechar}>
      <div className="evidence">
        <section className="evidence-head">
          <span>{evidence.titulo}</span>
          <strong>{evidence.valor}</strong>
          <em className={`evidence-state state-${estado}`}>{ROTULO_ESTADO[estado] ?? estado}</em>
          {estado === "stale" ? <p className="evidence-alert">DADO DESATUALIZADO: a medição tem mais de {m.reliability.staleAfterMs / 1000} s.</p> : null}
          {m.reliability.note ? <p className="evidence-note">{m.reliability.note}</p> : null}
        </section>

        <section className="evidence-list">
          <h3>Origem</h3>
          <Linha rotulo="Fonte">{m.source.type}</Linha>
          <Linha rotulo="Servidor">{m.source.server ?? "derivado de outras medições"}</Linha>
          <Linha rotulo="IP" mono>{m.source.host ?? "não se aplica"}</Linha>
          <Linha rotulo="Coletor" mono>{m.source.collector}</Linha>
          <Linha rotulo="Versão do coletor" mono>{m.source.collectorVersion ?? "não informada"}</Linha>
          <Linha rotulo="Métrica" mono>{m.source.metric}</Linha>
          <Linha rotulo="Endpoint de entrada" mono>{m.source.endpoint}</Linha>

          <h3>Tempo</h3>
          <Linha rotulo="Coletado em">{quando(m.observedAt)}</Linha>
          <Linha rotulo="Chegou ao backend">{quando(m.receivedAt)}</Linha>
          <Linha rotulo="Gravado no banco">{quando(m.persistedAt)}</Linha>
          <Linha rotulo="Exibido em">{quando(new Date(evidence.renderedAt).toISOString())}</Linha>
          <Linha rotulo="Idade do dado">{idade(idadeMs)}{m.observedAt ? "" : " (contada pela chegada)"}</Linha>

          <h3>Cálculo</h3>
          <Linha rotulo="Tipo">{m.calculation.type}</Linha>
          <Linha rotulo="Fórmula / regra">{m.calculation.formula}</Linha>
          <Linha rotulo="Código" mono>{m.calculation.code}</Linha>
          <Linha rotulo="Versão" mono>{m.calculation.version}</Linha>

          <h3>Valores brutos</h3>
          {rawEntries.length ? rawEntries.map(([k, v]) => (
            <Linha key={k} rotulo={k} mono>{v === null ? "null" : String(v)}</Linha>
          )) : <p className="evidence-note">Nenhum valor bruto guardado para esta leitura (coletor antigo).</p>}

          <h3>Transporte</h3>
          <ol className="evidence-transport">{m.transport.map((passo) => <li key={passo}>{passo}</li>)}</ol>
          <Linha rotulo="Consulta da tela" mono>{evidence.endpoint}</Linha>
          <Linha rotulo="Request id" mono>{evidence.requestId}</Linha>
        </section>

        {service ? (
          <section className="evidence-list">
            <h3>Health check</h3>
            <Linha rotulo="Serviço">{service.name}</Linha>
            <Linha rotulo="Servidor declarado">{service.declaredServerAlias}</Linha>
            <Linha rotulo="Hospedagem pelo DNS">{service.check.hosting.detail}</Linha>
            <Linha rotulo="URL verificada" mono>{service.url}</Linha>
            <Linha rotulo="URL final" mono>{service.check.finalUrl ?? "não informada"}</Linha>
            <Linha rotulo="Método" mono>{service.method}</Linha>
            <Linha rotulo="Hostname" mono>{service.check.hostname}</Linha>
            <Linha rotulo="IP resolvido" mono>{service.check.resolvedIp ?? "não informado"}</Linha>
            <Linha rotulo="Status HTTP" mono>{service.check.httpStatus ?? "sem resposta"}</Linha>
            <Linha rotulo="Tempo de resposta" mono>{service.latency.value === null ? "sem medição" : `${service.latency.value} ms`}</Linha>
            <Linha rotulo="DNS" mono>{service.check.timings.dnsMs === null ? "não medido" : `${service.check.timings.dnsMs} ms`}</Linha>
            <Linha rotulo="TCP" mono>{service.check.timings.connectMs === null ? "não medido" : `${service.check.timings.connectMs} ms`}</Linha>
            <Linha rotulo="TLS" mono>{service.check.timings.tlsMs === null ? "não medido" : `${service.check.timings.tlsMs} ms`}</Linha>
            <Linha rotulo="Espera (TTFB)" mono>{service.check.timings.ttfbMs === null ? "não medido" : `${service.check.timings.ttfbMs} ms`}</Linha>
            <Linha rotulo="Redirecionamentos" mono>{service.check.redirects ?? "não informado"}</Linha>
            <Linha rotulo="Disparado por" mono>{service.check.trigger ?? "não informado (check antigo)"}</Linha>
            <Linha rotulo="Id do check" mono>{service.check.id ?? "-"}</Linha>
            <Linha rotulo="Request id do check" mono>{service.check.requestId ?? "não informado (check antigo)"}</Linha>
          </section>
        ) : null}

        {service?.check.errorCode || (service && service.check.httpStatus !== null && (service.check.httpStatus < 200 || service.check.httpStatus > 299)) ? (
          <section className="evidence-list evidence-error">
            <h3>Erro</h3>
            <Linha rotulo="Categoria">{service.check.errorCategory ?? "não classificada"}</Linha>
            <Linha rotulo="Erro original" mono>{service.check.errorCode ?? `HTTP ${service.check.httpStatus}`}</Linha>
            <Linha rotulo="Mensagem original" mono>{service.check.errorMessage ?? "não informada (check antigo)"}</Linha>
            <Linha rotulo="URL testada" mono>{service.url}</Linha>
            <Linha rotulo="Hostname" mono>{service.check.hostname}</Linha>
            <Linha rotulo="Quando">{quando(service.check.checkedAt)}</Linha>
            {service.check.errorCategory === "TLS" ? (
              <p className="evidence-note">Em outras palavras: o navegador ou o probe não conseguiram confirmar o certificado do site (cadeia incompleta, nome que não bate ou emissor desconhecido). O código acima é o erro exato devolvido pelo Node.</p>
            ) : null}
          </section>
        ) : null}

        {service ? (
          <section className="evidence-list">
            <h3>Histórico retido (24 h)</h3>
            {erroDetalhe ? <p className="evidence-alert">Não foi possível carregar: {erroDetalhe}</p> : null}
            {!detalhe && !erroDetalhe ? <p className="evidence-note">Carregando…</p> : null}
            {detalhe ? (
              <>
                <Linha rotulo="Falhas seguidas">{detalhe.consecutiveFailures}</Linha>
                <Linha rotulo="Falhando desde">{quando(detalhe.failingSince)}</Linha>
                <Linha rotulo="Última falha">{quando(detalhe.lastFailureAt)}</Linha>
                <Linha rotulo="Última recuperação">{quando(detalhe.lastRecoveryAt)}</Linha>
                <Linha rotulo="Checks analisados">{detalhe.checksAnalyzed}</Linha>
                <Linha rotulo="Request id" mono>{detalhe.requestId}</Linha>
                <div className="evidence-checks">
                  <table>
                    <thead><tr><th>Quando</th><th>Status</th><th>HTTP</th><th>ms</th><th>Erro</th><th>Origem</th></tr></thead>
                    <tbody>
                      {detalhe.recentChecks.map((c) => (
                        <tr key={c.id} className={c.status === "DOWN" ? "down" : undefined}>
                          <td>{quando(c.checkedAt).slice(11)}</td>
                          <td>{c.status}</td>
                          <td>{c.httpStatus ?? "-"}</td>
                          <td>{c.latencyMs ?? "-"}</td>
                          <td className="mono">{c.errorCode ?? ""}</td>
                          <td>{c.trigger ?? "?"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        <button type="button" className="secondary-button" onClick={() => setJson((v) => !v)}>
          {json ? "Ocultar JSON bruto" : "Ver JSON bruto"}
        </button>
        {json ? <pre className="evidence-json">{JSON.stringify(service ?? m, null, 2)}</pre> : null}
      </div>
    </Sheet>
  );
}
