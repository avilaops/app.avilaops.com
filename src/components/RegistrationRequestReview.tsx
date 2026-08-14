"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RegistrationRequestReview({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "rejecting">("idle");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function approve() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/registration-requests/${requestId}/approve`, {
        method: "POST",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Falha ao aprovar.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível aprovar.");
    } finally {
      setSaving(false);
    }
  }

  async function reject() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/registration-requests/${requestId}/reject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ motivo: motivo || null }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Falha ao rejeitar.");
      setMode("idle");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível rejeitar.");
    } finally {
      setSaving(false);
    }
  }

  if (mode === "rejecting") {
    return (
      <div className="registration-review-editor">
        <textarea
          value={motivo}
          onChange={(event) => setMotivo(event.target.value)}
          placeholder="Motivo da rejeição (opcional)"
          maxLength={500}
        />
        {error ? <span className="form-error">{error}</span> : null}
        <div className="registration-review-actions">
          <button type="button" className="row-action" onClick={reject} disabled={saving}>
            {saving ? "Rejeitando…" : "Confirmar rejeição"}
          </button>
          <button type="button" className="text-button" onClick={() => setMode("idle")}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="registration-review-actions">
      <button type="button" className="small-primary" onClick={approve} disabled={saving}>
        {saving ? "Aprovando…" : "Aprovar"}
      </button>
      <button type="button" className="row-action" onClick={() => setMode("rejecting")} disabled={saving}>
        Rejeitar
      </button>
      {error ? <span className="form-error">{error}</span> : null}
    </div>
  );
}
