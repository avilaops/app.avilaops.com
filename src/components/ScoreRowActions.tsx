"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Confirmacao from "@/components/sistema/Confirmacao";

/** Apagar uma leitura registrada errado. Pede confirmação: não tem desfazer. */
export default function ScoreRowActions({ leituraId }: { leituraId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmando, setConfirmando] = useState(false);

  async function apagar() {
    if (busy) return;
    setConfirmando(false);
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/credit-scores/${leituraId}`, { method: "DELETE" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Falha ao apagar.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falhou.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="score-row-actions">
      <button type="button" className="text-button" disabled={busy} onClick={() => setConfirmando(true)}>
        Apagar
      </button>
      {error ? <small className="form-error">{error}</small> : null}
      {confirmando ? (
        <Confirmacao
          titulo="Apagar leitura de score"
          descricao="A leitura sai do histórico de crédito. Nada mais é alterado."
          rotuloConfirmar="Apagar"
          confirmando={busy}
          aoConfirmar={() => void apagar()}
          aoCancelar={() => setConfirmando(false)}
        />
      ) : null}
    </span>
  );
}
