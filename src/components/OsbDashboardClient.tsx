"use client";

import { useState } from "react";
import Link from "next/link";

export interface OsbDomainRow {
  id: string;
  fqdn: string;
  organizationName: string;
  cloudflareStatus: string;
  dnsRecordsCount: number;
  seoScore: number | null;
  seoStatus: string;
  perfScore: number | null;
  lcp: string;
  brokenLinksCount: number | null;
  daysToExpire: number | null;
  needsRenewal: boolean;
  overallHealth: "CRITICAL" | "WARNING" | "HEALTHY";
}

export default function OsbDashboardClient({
  initialRows,
}: {
  initialRows: OsbDomainRow[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [filter, setFilter] = useState<"ALL" | "CRITICAL" | "WARNING" | "HEALTHY">("ALL");
  const [status, setStatus] = useState<"idle" | "running">("idle");
  const [message, setMessage] = useState("");

  const filteredRows = rows.filter((r) => {
    if (filter === "CRITICAL") return r.overallHealth === "CRITICAL";
    if (filter === "WARNING") return r.overallHealth === "WARNING";
    if (filter === "HEALTHY") return r.overallHealth === "HEALTHY";
    return true;
  });

  const criticalCount = rows.filter((r) => r.overallHealth === "CRITICAL").length;
  const warningCount = rows.filter((r) => r.overallHealth === "WARNING").length;
  const healthyCount = rows.filter((r) => r.overallHealth === "HEALTHY").length;

  async function runMasterScan() {
    setStatus("running");
    setMessage("Iniciando varredura completa OSB (SEO, PageSpeed, Links e Vencimentos)...");

    try {
      await Promise.all([
        fetch("/api/integrations/seo-audit/run", { method: "POST" }),
        fetch("/api/integrations/lighthouse/run", { method: "POST" }),
        fetch("/api/integrations/links/run", { method: "POST" }),
        fetch("/api/domains/check-renewals/run", { method: "POST" }),
      ]);

      setMessage("Varredura completa OSB concluída com sucesso! Atualizando dados...");
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

      setMessage(`⚡ Auto-Fix SEO aplicado para ${fqdn}!`);
      window.location.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erro no Auto-Fix.");
      setStatus("idle");
    }
  }

  return (
    <div className="osb-dashboard">
      <section className="operations-metrics" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
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
      </section>

      <div className="osb-controls" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div className="filter-buttons" style={{ display: "flex", gap: "0.5rem" }}>
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
                    <strong>{r.organizationName}</strong>
                    <div style={{ fontSize: "0.85rem", color: "#888" }}>{r.fqdn}</div>
                  </td>
                  <td style={{ padding: "0.8rem" }}>
                    <span
                      style={{
                        padding: "0.25rem 0.6rem",
                        borderRadius: "12px",
                        fontSize: "0.75rem",
                        fontWeight: "bold",
                        background: r.overallHealth === "CRITICAL" ? "rgba(239,68,68,0.2)" : r.overallHealth === "WARNING" ? "rgba(245,158,11,0.2)" : "rgba(16,185,129,0.2)",
                        color: r.overallHealth === "CRITICAL" ? "#ef4444" : r.overallHealth === "WARNING" ? "#f59e0b" : "#10b981",
                      }}
                    >
                      {r.overallHealth === "CRITICAL" ? "🚨 CRÍTICO" : r.overallHealth === "WARNING" ? "⚠️ ATENÇÃO" : "✅ OK"}
                    </span>
                  </td>
                  <td style={{ padding: "0.8rem", fontWeight: "bold" }}>
                    {r.seoScore !== null ? `${r.seoScore}/100` : "Pendente"}
                  </td>
                  <td style={{ padding: "0.8rem" }}>
                    {r.perfScore !== null ? `${r.perfScore}/100` : "N/A"}
                    <div style={{ fontSize: "0.8rem", color: "#888" }}>LCP: {r.lcp}</div>
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
                        href={`/operacao/seo?domain=${r.fqdn}`}
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
