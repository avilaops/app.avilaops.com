"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  transactionId: string;
  currentStatus: string;
  referenceType?: string | null;
  referenceId?: string | null;
  note?: string | null;
};

export default function ReconciliationControl({
  transactionId,
  currentStatus,
  referenceType,
  referenceId,
  note,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(currentStatus);
  const [reference, setReference] = useState(referenceId ?? "");
  const [type, setType] = useState(referenceType ?? "ORDER");
  const [comment, setComment] = useState(note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/reconciliations/${transactionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status,
          referenceType: reference ? type : null,
          referenceId: reference || null,
          note: comment || null,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Falha ao conciliar");
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Não foi possível salvar.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="row-action"
        onClick={() => setOpen(true)}
      >
        Revisar
      </button>
    );
  }

  return (
    <div className="reconciliation-editor">
      <label>
        Estado
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="PENDING">Pendente</option>
          <option value="REVIEW">Em revisão</option>
          <option value="MATCHED">Conciliado</option>
          <option value="IGNORED">Ignorado</option>
        </select>
      </label>
      <label>
        Referência
        <div className="reference-fields">
          <select value={type} onChange={(event) => setType(event.target.value)}>
            <option value="ORDER">Pedido</option>
            <option value="INVOICE">Fatura</option>
            <option value="EXPENSE">Despesa</option>
            <option value="MANUAL">Manual</option>
          </select>
          <input
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="ID ou número"
            maxLength={120}
          />
        </div>
      </label>
      <label>
        Nota interna
        <input
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Motivo ou evidência"
          maxLength={300}
        />
      </label>
      {error ? <span className="form-error">{error}</span> : null}
      <div className="editor-actions">
        <button type="button" className="small-primary" onClick={save} disabled={saving}>
          {saving ? "Salvando…" : "Salvar"}
        </button>
        <button type="button" className="text-button" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
