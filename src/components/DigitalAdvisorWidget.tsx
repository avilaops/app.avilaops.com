"use client";

import { useState } from "react";
import { relatoDaEntrega } from "@/lib/entrega/relato";
import type { DigitalRecommendation } from "@/lib/digital-advisor";

export default function DigitalAdvisorWidget({
  fqdn,
  recommendations,
  totalUpsell,
}: {
  fqdn: string;
  recommendations: DigitalRecommendation[];
  totalUpsell: number;
}) {
  const [items, setItems] = useState(recommendations);
  const [message, setMessage] = useState("");

  async function handleAction(rec: DigitalRecommendation) {
    if (rec.actionType === "AUTOFIX") {
      setMessage(`Executando Auto-Fix para ${fqdn}...`);
      try {
        const res = await fetch("/api/integrations/seo-audit/autofix", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fqdn }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          setMessage(data.error || "Falha no Auto-Fix.");
          return;
        }
        // A recomendação só sai da lista quando os arquivos estão mesmo no ar.
        // Antes ela sumia em qualquer resposta com `success`, inclusive quando
        // o domínio nem passa pela borda — e voltava na próxima auditoria.
        const relato = relatoDaEntrega(data.result.entrega);
        setMessage(relato.texto);
        if (relato.ok) setItems(items.filter((i) => i.id !== rec.id));
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Falha na ação.");
      }
    } else {
      setMessage(`💡 Oportunidade registrada! Proposta pronta para envio ao cliente.`);
    }
  }

  if (items.length === 0) {
    return (
      <div className="advisor-widget" style={{ background: "rgba(16,185,129,0.1)", border: "1px solid #10b981", borderRadius: "8px", padding: "1.2rem", marginTop: "1rem" }}>
        <h4 style={{ margin: 0, color: "#10b981" }}>🌟 Diagnóstico Digital Perfeito</h4>
        <p style={{ margin: "0.4rem 0 0 0", fontSize: "0.9rem", color: "#aaa" }}>
          Nenhuma recomendação pendente para {fqdn}. O site está operando com nota máxima!
        </p>
      </div>
    );
  }

  return (
    <div className="advisor-widget" style={{ background: "var(--surface-color, #111)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "1.2rem", marginTop: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div>
          <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#3b82f6", fontWeight: "bold" }}>Ávila Digital Advisor</span>
          <h3 style={{ margin: 0, fontSize: "1.1rem" }}>Diagnóstico & Oportunidades de Receita</h3>
        </div>
        {totalUpsell > 0 ? (
          <div style={{ background: "rgba(16,185,129,0.15)", border: "1px solid #10b981", color: "#10b981", padding: "0.4rem 0.8rem", borderRadius: "20px", fontSize: "0.85rem", fontWeight: "bold" }}>
            Potencial Upsell: R$ {totalUpsell.toFixed(2).replace(".", ",")}
          </div>
        ) : null}
      </div>

      {message ? (
        <div style={{ padding: "0.6rem", background: "rgba(59,130,246,0.1)", border: "1px solid #3b82f6", color: "#60a5fa", borderRadius: "6px", marginBottom: "1rem", fontSize: "0.85rem" }}>
          {message}
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
        {items.map((rec) => (
          <div
            key={rec.id}
            style={{
              padding: "0.8rem 1rem",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "6px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "1rem",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span
                  style={{
                    fontSize: "0.65rem",
                    padding: "0.15rem 0.4rem",
                    borderRadius: "4px",
                    fontWeight: "bold",
                    background: rec.priority === "HIGH" ? "#ef4444" : rec.priority === "MEDIUM" ? "#f59e0b" : "#3b82f6",
                    color: "#fff",
                  }}
                >
                  {rec.priority}
                </span>
                <strong style={{ fontSize: "0.95rem" }}>{rec.title}</strong>
              </div>
              <p style={{ margin: "0.3rem 0 0 0", fontSize: "0.85rem", color: "#aaa" }}>{rec.description}</p>
            </div>

            <button
              onClick={() => handleAction(rec)}
              style={{
                padding: "0.5rem 0.9rem",
                borderRadius: "6px",
                border: "none",
                background: rec.actionType === "AUTOFIX" ? "#2563eb" : "#059669",
                color: "#fff",
                fontSize: "0.8rem",
                fontWeight: "600",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {rec.actionLabel}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
