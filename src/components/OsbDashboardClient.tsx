"use client";

import { useState } from "react";
import Link from "next/link";
import { relatoDaEntrega } from "@/lib/entrega/relato";
import { nomeProprio } from "@/lib/format";

export interface OsbDomainRow {
  id: string;
  fqdn: string;
  organizationName: string;
  cloudflareStatus: string;
  dnsRecordsCount: number;
  seoScore: number | null;
  seoStatus: string;
  seoError: string | null;
  perfScore: number | null;
  perfError: string | null;
  perfCheckedAt: string | null;
  lcp: string | null;
  brokenLinksCount: number | null;
  daysToExpire: number | null;
  needsRenewal: boolean;
  overallHealth: OsbHealth;
}

export type OsbHealth = "CRITICAL" | "WARNING" | "HEALTHY" | "UNKNOWN";

const HEALTH_STYLE: Record<OsbHealth, { label: string; color: string; background: string }> = {
  CRITICAL: { label: "🚨 CRÍTICO", color: "#ef4444", background: "rgba(239,68,68,0.2)" },
  WARNING: { label: "⚠️ ATENÇÃO", color: "#f59e0b", background: "rgba(245,158,11,0.2)" },
  HEALTHY: { label: "✅ OK", color: "#10b981", background: "rgba(16,185,129,0.2)" },
  UNKNOWN: { label: "❔ SEM DADOS", color: "#9ca3af", background: "rgba(107,114,128,0.2)" },
};

export default function OsbDashboardClient({
  initialRows,
}: {
  initialRows: OsbDomainRow[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [filter, setFilter] = useState<"ALL" | OsbHealth>("ALL");
  const [status, setStatus] = useState<"idle" | "running">("idle");
  const [message, setMessage] = useState("");

  const filteredRows = rows.filter((r) => (filter === "ALL" ? true : r.overallHealth === filter));

  const criticalCount = rows.filter((r) => r.overallHealth === "CRITICAL").length;
  const warningCount = rows.filter((r) => r.overallHealth === "WARNING").length;
  const healthyCount = rows.filter((r) => r.overallHealth === "HEALTHY").length;
  const unknownCount = rows.filter((r) => r.overallHealth === "UNKNOWN").length;
  const perfMissingCount = rows.filter((r) => r.perfScore === null).length;

  async function runMasterScan() {
    setStatus("running");
    setMessage("Iniciando varredura completa OSB (SEO, PageSpeed, Links e Vencimentos)...");

    try {
      const [, lighthouseRes] = await Promise.all([
        fetch("/api/integrations/seo-audit/run", { method: "POST" }),
        fetch("/api/integrations/lighthouse/run", { method: "POST" }),
        fetch("/api/integrations/links/run", { method: "POST" }),
        fetch("/api/domains/check-renewals/run", { method: "POST" }),
      ]);

      const psi = (await lighthouseRes.json().catch(() => null)) as
        | { measured?: number; failed?: number; hasCredentials?: boolean }
        | null;

      const psiResumo =
        psi && typeof psi.measured === "number"
          ? ` PageSpeed: ${psi.measured} medido(s), ${psi.failed ?? 0} sem dados${
              psi.hasCredentials === false ? " (sem credencial do Google configurada)" : ""
            }.`
          : "";

      setMessage(`Varredura completa OSB concluída.${psiResumo} Atualizando dados...`);
      window.location.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha na varredura OSB.");
      setStatus("idle");
    }
  }

  async function sendWeeklyReport() {
    setStatus("running");
    setMessage("Gerando relatórios de Saúde Digital...");

    try {
      const res = await fetch("/api/reports/weekly-health/run", { method: "POST" });
      const data = await res.json();
      setMessage(`Relatórios gerados para ${data.count ?? 0} domínios!`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha no relatório.");
    } finally {
      setStatus("idle");
    }
  }

  async function runDomainAutoFix(fqdn: string) {
    setStatus("running");
    setMessage(`Aplicando Auto-Fix SEO para ${fqdn}...`);

    try {
      const res = await fetch("/api/integrations/seo-audit/autofix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fqdn }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Falha no Auto-Fix.");

      // Recarregar a página apaga a mensagem; só vale a pena quando a nota da
      // linha mudou de fato, ou seja, quando os arquivos entraram no ar.
      const relato = relatoDaEntrega(data.result.entrega);
      setMessage(relato.texto);
      if (relato.ok) window.location.reload();
      else setStatus("idle");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erro no Auto-Fix.");
      setStatus("idle");
    }
  }

  return (
    <div className="osb-dashboard">
      <section className="operations-metrics metric-cards" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <article className="operations-metric" style={{ background: "var(--surface-color, #1a1a1a)", padding: "1.2rem", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)" }}>
          <span style={{ fontSize: "0.8rem", color: "#888", textTransform: "uppercase" }}>Total de Domínios</span>
          <strong style={{ fontSize: "2rem", display: "block", marginTop: "0.2rem" }}>{rows.length}</strong>
        </article>

        <article className="operations-metric" style={{ background: "var(--surface-color, #1a1a1a)", padding: "1.2rem", borderRadius: "8px", border: "1px solid #ef4444" }}>
          <span style={{ fontSize: "0.8rem", color: "#ef4444", textTransform: "uppercase", fontWeight: "600" }}>🚨 Crítico (Ação)</span>
          <strong style={{ fontSize: "2rem", display: "block", marginTop: "0.2rem", color: "#ef4444" }}>{criticalCount}</strong>
        </article>

        <article className="operations-metric" style={{ background: "var(--surface-color, #1a1a1a)", padding: "1.2rem", borderRadius: "8px", border: "1px solid #f59e0b" }}>
          <span style={{ fontSize: "0.8rem", color: "#f59e0b", textTransform: "uppercase", fontWeight: "600" }}>⚠️ Atenção</span>
          <strong style={{ fontSize: "2rem", display: "block", marginTop: "0.2rem", color: "#f59e0b" }}>{warningCount}</strong>
        </article>

        <article className="operations-metric" style={{ background: "var(--surface-color, #1a1a1a)", padding: "1.2rem", borderRadius: "8px", border: "1px solid #10b981" }}>
          <span style={{ fontSize: "0.8rem", color: "#10b981", textTransform: "uppercase", fontWeight: "600" }}>✅ Saudável</span>
          <strong style={{ fontSize: "2rem", display: "block", marginTop: "0.2rem", color: "#10b981" }}>{healthyCount}</strong>
        </article>

        <article className="operations-metric" style={{ background: "var(--surface-color, #1a1a1a)", padding: "1.2rem", borderRadius: "8px", border: "1px solid #6b7280" }}>
          <span style={{ fontSize: "0.8rem", color: "#9ca3af", textTransform: "uppercase", fontWeight: "600" }}>❔ Sem dados</span>
          <strong style={{ fontSize: "2rem", display: "block", marginTop: "0.2rem", color: "#9ca3af" }}>{unknownCount}</strong>
        </article>
      </section>

      {perfMissingCount > 0 ? (
        <div
          style={{
            padding: "0.8rem",
            background: "rgba(107,114,128,0.12)",
            border: "1px solid #6b7280",
            borderRadius: "6px",
            marginBottom: "1.5rem",
            color: "#9ca3af",
            fontSize: "0.9rem",
          }}
        >
          ❔ {perfMissingCount} de {rows.length} domínio(s) estão sem medição de PageSpeed. Enquanto a coleta não
          funcionar, esse indicador não entra no cálculo da saúde geral - não é 0/100.
        </div>
      ) : null}

      <div className="osb-controls" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        {/* Quebra em linhas: os cinco filtros somam 444px e saem da tela a 390px. */}
        <div className="filter-buttons" style={{ display: "flex", flexWrap: "wrap", minWidth: 0, gap: "0.5rem" }}>
          <button
            onClick={() => setFilter("ALL")}
            style={{ padding: "0.5rem 1rem", borderRadius: "6px", border: "none", background: filter === "ALL" ? "#3b82f6" : "#333", color: "#fff", cursor: "pointer" }}
          >
            Todos ({rows.length})
          </button>
          <button
            onClick={() => setFilter("CRITICAL")}
            style={{ padding: "0.5rem 1rem", borderRadius: "6px", border: "none", background: filter === "CRITICAL" ? "#ef4444" : "#333", color: "#fff", cursor: "pointer" }}
          >
            🚨 Crítico ({criticalCount})
          </button>
          <button
            onClick={() => setFilter("WARNING")}
            style={{ padding: "0.5rem 1rem", borderRadius: "6px", border: "none", background: filter === "WARNING" ? "#f59e0b" : "#333", color: "#fff", cursor: "pointer" }}
          >
            ⚠️ Atenção ({warningCount})
          </button>
          <button
            onClick={() => setFilter("HEALTHY")}
            style={{ padding: "0.5rem 1rem", borderRadius: "6px", border: "none", background: filter === "HEALTHY" ? "#10b981" : "#333", color: "#fff", cursor: "pointer" }}
          >
            ✅ Saudável ({healthyCount})
          </button>
          <button
            onClick={() => setFilter("UNKNOWN")}
            style={{ padding: "0.5rem 1rem", borderRadius: "6px", border: "none", background: filter === "UNKNOWN" ? "#6b7280" : "#333", color: "#fff", cursor: "pointer" }}
          >
            ❔ Sem dados ({unknownCount})
          </button>
        </div>

        <div className="master-actions" style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={runMasterScan}
            disabled={status === "running"}
            style={{ padding: "0.6rem 1.2rem", borderRadius: "6px", border: "none", background: "#2563eb", color: "#fff", fontWeight: "600", cursor: "pointer" }}
          >
            {status === "running" ? "Executando Varredura..." : "⚡ Varredura Completa OSB"}
          </button>
          <button
            onClick={sendWeeklyReport}
            disabled={status === "running"}
            style={{ padding: "0.6rem 1.2rem", borderRadius: "6px", border: "none", background: "#059669", color: "#fff", fontWeight: "600", cursor: "pointer" }}
          >
            📱 Relatório WhatsApp
          </button>
        </div>
      </div>

      {message ? (
        <div className="status-message" style={{ padding: "0.8rem", background: "rgba(59,130,246,0.1)", border: "1px solid #3b82f6", borderRadius: "6px", marginBottom: "1.5rem", color: "#60a5fa" }}>
          {message}
        </div>
      ) : null}

      <section className="operations-panel clients-panel">
        <div className="table-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                <th style={{ padding: "0.8rem" }}>Empresa / Domínio</th>
                <th style={{ padding: "0.8rem" }}>Saúde Geral</th>
                <th style={{ padding: "0.8rem" }}>SEO Score</th>
                <th style={{ padding: "0.8rem" }}>PageSpeed / LCP</th>
                <th style={{ padding: "0.8rem" }}>Links Quebrados</th>
                <th style={{ padding: "0.8rem" }}>Vencimento Domínio</th>
                <th style={{ padding: "0.8rem" }}>Ações Rápidas</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <td style={{ padding: "0.8rem" }}>
                    <strong>{nomeProprio(r.organizationName)}</strong>
                    <div style={{ fontSize: "0.85rem", color: "#888" }}>{r.fqdn}</div>
                  </td>
                  <td style={{ padding: "0.8rem" }}>
                    <span
                      style={{
                        padding: "0.25rem 0.6rem",
                        borderRadius: "12px",
                        fontSize: "0.75rem",
                        fontWeight: "bold",
                        background: HEALTH_STYLE[r.overallHealth].background,
                        color: HEALTH_STYLE[r.overallHealth].color,
                      }}
                    >
                      {HEALTH_STYLE[r.overallHealth].label}
                    </span>
                  </td>
                  <td style={{ padding: "0.8rem", fontWeight: "bold" }}>
                    {r.seoScore !== null ? `${r.seoScore}/100` : "Pendente"}
                    {r.seoError ? (
                      <div style={{ fontSize: "0.75rem", color: "#f59e0b", fontWeight: "normal" }} title={r.seoError}>
                        ⚠️ {r.seoError.slice(0, 48)}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ padding: "0.8rem" }}>
                    {r.perfScore !== null ? (
                      <>
                        <strong>{r.perfScore}/100</strong>
                        <div style={{ fontSize: "0.8rem", color: "#888" }}>LCP: {r.lcp ?? "N/A"}</div>
                      </>
                    ) : (
                      <>
                        <span style={{ color: "#9ca3af" }}>Sem medição</span>
                        <div style={{ fontSize: "0.75rem", color: "#9ca3af" }} title={r.perfError ?? undefined}>
                          {r.perfError ? `❔ ${r.perfError.slice(0, 48)}` : "❔ Coleta ainda não executada"}
                        </div>
                      </>
                    )}
                  </td>
                  <td style={{ padding: "0.8rem" }}>
                    {r.brokenLinksCount !== null ? (
                      r.brokenLinksCount > 0 ? (
                        <span style={{ color: "#ef4444", fontWeight: "bold" }}>❌ {r.brokenLinksCount} link(s)</span>
                      ) : (
                        <span style={{ color: "#10b981" }}>✅ 0 quebrados</span>
                      )
                    ) : (
                      "N/A"
                    )}
                  </td>
                  <td style={{ padding: "0.8rem" }}>
                    {r.daysToExpire !== null ? (
                      r.daysToExpire <= 30 ? (
                        <span style={{ color: "#ef4444", fontWeight: "bold" }}>⚠️ Vence em {r.daysToExpire}d</span>
                      ) : (
                        `Vence em ${r.daysToExpire}d`
                      )
                    ) : (
                      "Sem data"
                    )}
                  </td>
                  <td style={{ padding: "0.8rem" }}>
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      <button
                        onClick={() => runDomainAutoFix(r.fqdn)}
                        disabled={status === "running"}
                        style={{ padding: "0.3rem 0.6rem", borderRadius: "4px", border: "none", background: "#2563eb", color: "#fff", fontSize: "0.75rem", cursor: "pointer" }}
                      >
                        ⚡ Auto-Fix
                      </button>
                      <Link
                        href={`/hub-social/seo?domain=${r.fqdn}`}
                        style={{ padding: "0.3rem 0.6rem", borderRadius: "4px", background: "#333", color: "#fff", fontSize: "0.75rem", textDecoration: "none" }}
                      >
                        Detalhes
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
