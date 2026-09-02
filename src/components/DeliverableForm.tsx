"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function DeliverableForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");
    const form = event.currentTarget;
    const body = new FormData(form);

    try {
      const response = await fetch(`/api/projects/${projectId}/deliverables`, {
        method: "POST",
        body,
      });
      const result = (await response.json()) as {
        deliverable?: { accessToken: string };
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error ?? "Não foi possível criar o entregável.");
      }

      setMessage("Entregável criado. O link público já aparece na lista abaixo.");
      form.isConnected && form.reset();
      router.refresh();
      window.setTimeout(() => {
        setOpen(false);
        setMessage("");
      }, 2000);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Não foi possível criar o entregável.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="organization-form-wrap">
      <button
        className="primary-button"
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          setError("");
          setMessage("");
        }}
        aria-expanded={open}
      >
        {open ? "Fechar cadastro" : "Novo entregável"}
        <span aria-hidden="true">{open ? "×" : "+"}</span>
      </button>

      {open ? (
        <form className="organization-form" onSubmit={submit}>
          <div className="form-title">
            <div>
              <h2>Nova entrega</h2>
            </div>
            <span className="status-chip">PIX · Boleto · Cartão</span>
          </div>

          <div className="operations-form-grid">
            <label>
              Título *
              <input name="title" required minLength={3} maxLength={160} placeholder="Ex.: Catálogo PK Vedações" />
            </label>
            <label>
              Valor (R$) *
              <input name="amount" type="number" step="0.01" min="0.01" required placeholder="990.00" />
            </label>
            <label>
              Nome do destinatário
              <input name="recipientName" maxLength={120} placeholder="Opcional" />
            </label>
            <label>
              E-mail do destinatário
              <input name="recipientEmail" type="email" maxLength={160} placeholder="Opcional" />
            </label>
            <label>
              Descrição
              <input name="description" maxLength={2000} placeholder="Aparece na página pública" />
            </label>
            <label>
              Prévia (opcional, PDF ou imagem)
              <input name="previewFile" type="file" accept=".pdf,image/*" />
            </label>
            <label>
              Arquivo completo *
              <input name="fullFile" type="file" required />
            </label>
          </div>

          <div className="organization-form-actions">
            <p>
              A prévia fica pública. O arquivo completo só é liberado para download
              depois que o pagamento (PIX, boleto ou cartão) for confirmado.
            </p>
            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? "Enviando…" : "Criar entregável"}
            </button>
          </div>

          {error ? <p className="inline-feedback feedback-error">{error}</p> : null}
          {message ? <p className="inline-feedback feedback-success">{message}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
