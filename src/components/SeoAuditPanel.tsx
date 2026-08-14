"use client";

import { useState } from "react";
import type { DomainSeoAuditResult } from "@/lib/seo-audit";
import type { PageSpeedAuditResult } from "@/lib/pagespeed";

type Connection = {
  id: string;
  status: string;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  metadata?: unknown;
} | null;

export default function SeoAuditPanel({
  fqdn,
  initialSeoConnection,
  initialLighthouseConnection,
}: {
  fqdn: string;
  initialSeoConnection: Connection;
  initialLighthouseConnection: Connection;
}) {
  const [seoConnection, setSeoConnection] = useState(initialSeoConnection);
  const [lighthouseConnection, setLighthouseConnection] = useState(initialLighthouseConnection);
  const [status, setStatus] = useState<"idle" | "running">("idle");
  const [message, setMessage] = useState("");

  const seoData = seoConnection?.metadata as DomainSeoAuditResult | undefined;
  const psiData = lighthouseConnection?.metadata as PageSpeedAuditResult | undefined;

  async function runAudit(targetFqdn?: string) {
    setStatus("running");
    setMessage("");

    try {
      const target = targetFqdn || fqdn;
      const [seoRes, psiRes] = await Promise.all([
        fetch("/api/integrations/seo-audit/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fqdn: target }),
        }),
        fetch("/api/integrations/lighthouse/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fqdn: target }),
        }),
      ]);

      const seoJson = await seoRes.json();
      const psiJson = await psiRes.json();

      if (seoJson.result) {
        setSeoConnection({
          id: "seo_audit",
          status: seoJson.result.status,
          lastSyncedAt: seoJson.result.checkedAt,
          lastSyncStatus: "SUCCESS",
          lastSyncError: seoJson.result.error || null,
          metadata: seoJson.result,
        });
      }

      if (psiJson.result) {
        setLighthouseConnection({
          id: "lighthouse",
          status: psiJson.result.status,
          lastSyncedAt: psiJson.result.checkedAt,
          lastSyncStatus: "SUCCESS",
          lastSyncError: psiJson.result.error || null,
          metadata: psiJson.result,
        });
      }

      setMessage(`Auditoria técnica e PageSpeed concluídos para ${target}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao executar auditoria.");
    } finally {
      setStatus("idle");
    }
  }

  async function runAutoFix() {
    setStatus("running");
    setMessage("");

    try {
      const res = await fetch("/api/integrations/seo-audit/autofix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fqdn }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Falha ao aplicar Auto-Fix SEO.");
      }

      setMessage(`⚡ Auto-Fix SEO aplicado com sucesso para ${fqdn}! Re-auditando...`);
      await runAudit(fqdn);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha no Auto-Fix SEO.");
      setStatus("idle");
    }
  }

  const score = seoData?.score ?? null;
  const perfScore = psiData?.performanceScore ?? null;

  return (
    <article className="operations-panel">
      <div className="operations-panel-heading">
        <div>
          <span className="eyebrow">Auditoria Técnica SEO & Core Web Vitals</span>
          <h2>{fqdn}</h2>
        </div>
        <div className="panel-actions" style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className="secondary-button"
            onClick={runAutoFix}
            disabled={status === "running"}
            style={{ background: "#2563eb", color: "#fff", border: "none" }}
          >
            ⚡ Auto-Fix SEO
          </button>
          <button
            className="secondary-button"
            onClick={() => runAudit(fqdn)}
            disabled={status === "running"}
          >
            {status === "running" ? "Analisando..." : "Rodar Auditoria Agora"}
          </button>
        </div>
      </div>

      {message ? <p className="operations-message">{message}</p> : null}

      <div className="audit-metrics-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", margin: "1.5rem 0" }}>
        <div className="metric-box" style={{ background: "var(--surface-color, #1a1a1a)", padding: "1rem", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)" }}>
          <span style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "#888" }}>Score SEO Técnico</span>
          <div style={{ fontSize: "2rem", fontWeight: "bold", color: score !== null ? (score >= 75 ? "#10b981" : score >= 45 ? "#f59e0b" : "#ef4444") : "#aaa" }}>
            {score !== null ? `${score}/100` : "Pendente"}
          </div>
        </div>

        <div className="metric-box" style={{ background: "var(--surface-color, #1a1a1a)", padding: "1rem", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)" }}>
          <span style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "#888" }}>Performance (Lighthouse)</span>
          <div style={{ fontSize: "2rem", fontWeight: "bold", color: perfScore !== null ? (perfScore >= 80 ? "#10b981" : perfScore >= 50 ? "#f59e0b" : "#ef4444") : "#aaa" }}>
            {perfScore !== null ? `${perfScore}/100` : "Pendente"}
          </div>
        </div>

        <div className="metric-box" style={{ background: "var(--surface-color, #1a1a1a)", padding: "1rem", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)" }}>
          <span style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "#888" }}>LCP (Largest Contentful Paint)</span>
          <div style={{ fontSize: "1.2rem", fontWeight: "600", marginTop: "0.4rem" }}>
            {psiData?.lcp ?? "N/A"}
          </div>
        </div>

        <div className="metric-box" style={{ background: "var(--surface-color, #1a1a1a)", padding: "1rem", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)" }}>
          <span style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "#888" }}>CLS / INP</span>
          <div style={{ fontSize: "1rem", fontWeight: "600", marginTop: "0.4rem" }}>
            CLS: {psiData?.cls ?? "N/A"} | INP: {psiData?.inp ?? "N/A"}
          </div>
        </div>
      </div>

      <div className="audit-checklist" style={{ background: "var(--surface-color, #111)", padding: "1.2rem", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)" }}>
        <h4 style={{ margin: "0 0 1rem 0" }}>Checklist de Saúde Técnica</h4>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.8rem" }}>
          <div>
            <strong>robots.txt:</strong> {seoData?.robots.ok ? "✅ Presente" : "❌ Ausente/Erro"}
            {seoData?.robots.hasSitemap ? " (Sitemap OK)" : ""}
          </div>
          <div>
            <strong>sitemap.xml:</strong> {seoData?.sitemap.ok ? `✅ Presente (${seoData.sitemap.urlCount} URLs)` : "❌ Ausente"}
          </div>
          <div>
            <strong>llms.txt:</strong> {seoData?.llms.ok ? "✅ Presente" : "⚠️ Ausente"}
          </div>
          <div>
            <strong>Favicon:</strong> {seoData?.favicon.ok ? "✅ OK" : "⚠️ Faltando"}
          </div>
          <div>
            <strong>Manifest.json:</strong> {seoData?.manifest.ok ? "✅ Presente" : "⚠️ Ausente"}
          </div>
          <div>
            <strong>Canonical URL:</strong> {seoData?.homeHtml.hasCanonical ? "✅ Configurada" : "❌ Faltando"}
          </div>
          <div>
            <strong>Open Graph (OG):</strong> {seoData?.homeHtml.hasOgTitle && seoData?.homeHtml.hasOgDescription ? "✅ OK" : "⚠️ Incompleto"}
          </div>
          <div>
            <strong>Schema.org / JSON-LD:</strong> {seoData?.homeHtml.hasJsonLd ? "✅ Detectado" : "⚠️ Ausente"}
          </div>
        </div>
      </div>
    </article>
  );
}
