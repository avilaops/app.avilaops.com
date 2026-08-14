"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  id: string;
  title: string;
  categoryLabel: string;
  status: string;
  statusLabel: string;
  linkUrl: string | null;
  note: string | null;
};

const statusOptions = [
  { value: "NOT_STARTED", label: "Não iniciado" },
  { value: "IN_PROGRESS", label: "Em andamento" },
  { value: "DONE", label: "Concluído" },
];

export default function PartnerDocumentRow({
  id,
  title,
  categoryLabel,
  status,
  linkUrl,
  note,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(status);
  const [link, setLink] = useState(linkUrl ?? "");
  const [comment, setComment] = useState(note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/partner-network/documents/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: currentStatus,
          linkUrl: link || null,
          note: comment || null,
        }),
      });
      if (!response.ok) throw new Error("Falha ao salvar.");
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="doc-row">
      <div className="doc-row-main">
        <span className={`status-pill status-${currentStatus.toLowerCase().replace("_", "-")}`}>
          {statusOptions.find((option) => option.value === currentStatus)?.label}
        </span>
        <div>
          <strong>{title}</strong>
          <small>{categoryLabel}</small>
        </div>
        {linkUrl ? (
          <a href={linkUrl} target="_blank" rel="noreferrer" className="doc-link">
            Abrir
          </a>
        ) : null}
        <button type="button" className="row-action" onClick={() => setOpen((value) => !value)}>
          {open ? "Fechar" : "Editar"}
        </button>
      </div>

      {open ? (
        <div className="doc-editor">
          <label>
            Estado
            <select
              value={currentStatus}
              onChange={(event) => setCurrentStatus(event.target.value)}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Link ou caminho do arquivo
            <input
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="https://... ou caminho do repositório"
              maxLength={500}
            />
          </label>
          <label>
            Nota
            <input
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Observações"
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
      ) : null}
    </div>
  );
}
