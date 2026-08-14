"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDateTime } from "@/lib/format";

type Props = {
  id: string;
  projectId: string;
  agentId: string;
  toolName: string;
  summary: string;
  payloadPreview: string;
  status: string;
  decidedBy: string | null;
  decidedAt: Date | null;
  rejectionReason: string | null;
  expiresAt: Date;
  isExpired: boolean;
  createdAt: Date;
};

export default function ApprovalCard({
  id,
  projectId,
  agentId,
  toolName,
  summary,
  payloadPreview,
  status,
  decidedBy,
  decidedAt,
  rejectionReason,
  expiresAt,
  isExpired,
  createdAt,
}: Props) {
  const router = useRouter();
  const [showPayload, setShowPayload] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const effectiveStatus = status === "PENDING" && isExpired ? "EXPIRED" : status;
  const isPending = effectiveStatus === "PENDING";

  async function decide(decision: "APPROVED" | "REJECTED") {
    if (decision === "REJECTED" && !reason.trim()) {
      setShowRejectForm(true);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/internal/ai-core/approvals/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision,
          rejectionReason: decision === "REJECTED" ? reason : undefined,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Falha ao decidir.");

      setShowRejectForm(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  const statusLabel: Record<string, string> = {
    PENDING: "Pendente",
    APPROVED: "Aprovado",
    REJECTED: "Rejeitado",
    EXPIRED: "Expirado",
    EXECUTED: "Executado",
  };
  const statusClass: Record<string, string> = {
    PENDING: "status-pending",
    APPROVED: "status-done",
    REJECTED: "status-pending",
    EXPIRED: "status-pending",
    EXECUTED: "status-done",
  };

  return (
    <div className="case">
      <div className="case-head">
        <div>
          <span className="case-id">
            {projectId} · {agentId}
          </span>
          <h4>{toolName}</h4>
        </div>
        <span className={`status-pill ${statusClass[effectiveStatus] ?? "status-pending"}`}>
          {statusLabel[effectiveStatus] ?? effectiveStatus}
        </span>
      </div>
      <div className="case-body-simple">
        <p>{summary}</p>

        <div className="metric-list">
          <div className="metric-row">
            <span className="label">Solicitado em</span>
            <span className="val">{formatDateTime(createdAt)}</span>
          </div>
          <div className="metric-row">
            <span className="label">Expira em</span>
            <span className="val">{formatDateTime(expiresAt)}</span>
          </div>
          {decidedBy ? (
            <div className="metric-row">
              <span className="label">Decidido por</span>
              <span className="val">{decidedBy}</span>
            </div>
          ) : null}
          {decidedAt ? (
            <div className="metric-row">
              <span className="label">Decidido em</span>
              <span className="val">{formatDateTime(decidedAt)}</span>
            </div>
          ) : null}
        </div>

        {rejectionReason ? (
          <p style={{ color: "var(--red, #c0392b)", fontSize: "0.78rem" }}>
            Motivo da rejeição: {rejectionReason}
          </p>
        ) : null}

        <button type="button" className="row-action" onClick={() => setShowPayload((v) => !v)}>
          {showPayload ? "Ocultar parâmetros" : "Ver parâmetros"}
        </button>
        {showPayload ? (
          <pre
            style={{
              fontSize: "0.72rem",
              maxHeight: 200,
              overflow: "auto",
              background: "var(--input-bg)",
              padding: 10,
              marginTop: 8,
            }}
          >
            {payloadPreview}
          </pre>
        ) : null}

        {isPending ? (
          <div className="editor-actions" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="small-primary"
              onClick={() => decide("APPROVED")}
              disabled={saving}
            >
              {saving ? "Salvando…" : "Aprovar"}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setShowRejectForm((v) => !v)}
              disabled={saving}
            >
              Rejeitar
            </button>
          </div>
        ) : null}

        {showRejectForm ? (
          <div className="case-editor" style={{ marginTop: 8 }}>
            <label>
              Justificativa da rejeição (obrigatória)
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Por que esta ação não deve ser executada"
                maxLength={500}
              />
            </label>
            {error ? <span className="form-error">{error}</span> : null}
            <div className="editor-actions">
              <button
                type="button"
                className="small-primary"
                onClick={() => decide("REJECTED")}
                disabled={saving || !reason.trim()}
              >
                {saving ? "Salvando…" : "Confirmar rejeição"}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setShowRejectForm(false);
                  setError("");
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : error && !showRejectForm ? (
          <span className="form-error">{error}</span>
        ) : null}
      </div>
    </div>
  );
}
