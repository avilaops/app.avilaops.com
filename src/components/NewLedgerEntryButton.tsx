"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function NewLedgerEntryButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"PAYABLE" | "RECEIVABLE">(
    "RECEIVABLE",
  );
  const [description, setDescription] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(todayIso());
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setDirection("RECEIVABLE");
    setDescription("");
    setCounterparty("");
    setAmount("");
    setDueDate(todayIso());
    setCategory("");
    setNote("");
    setError("");
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/ledger-entries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          direction,
          description,
          counterparty: counterparty || null,
          amount: Number.parseFloat(amount.replace(",", ".")),
          dueDate: dueDate ? new Date(`${dueDate}T12:00:00`).toISOString() : null,
          category: category || null,
          note: note || null,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Falha ao lançar.");

      setOpen(false);
      reset();
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
        className="secondary-button"
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">+</span>
        Novo lançamento
      </button>
    );
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => setOpen(false)}>
      <div
        className="modal-panel ledger-entry-editor"
        role="dialog"
        aria-modal="true"
        aria-label="Novo lançamento"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <h2>Novo lançamento</h2>
          <p>Registre uma conta a pagar ou a receber fora do fluxo do Éfi.</p>
        </div>

        <div className="direction-toggle" role="radiogroup" aria-label="Tipo de lançamento">
          <button
            type="button"
            role="radio"
            aria-checked={direction === "RECEIVABLE"}
            className={direction === "RECEIVABLE" ? "active" : ""}
            onClick={() => setDirection("RECEIVABLE")}
          >
            A receber
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={direction === "PAYABLE"}
            className={direction === "PAYABLE" ? "active" : ""}
            onClick={() => setDirection("PAYABLE")}
          >
            A pagar
          </button>
        </div>

        <label>
          Descrição
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Ex.: Mensalidade cliente X"
            maxLength={200}
          />
        </label>

        <div className="reference-fields">
          <label>
            Valor (R$)
            <input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0,00"
            />
          </label>
          <label>
            Vencimento
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </label>
        </div>

        <label>
          Contraparte
          <input
            value={counterparty}
            onChange={(event) => setCounterparty(event.target.value)}
            placeholder="Cliente ou fornecedor"
            maxLength={160}
          />
        </label>

        <label>
          Categoria
          <input
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="Ex.: Hospedagem, folha, imposto"
            maxLength={60}
          />
        </label>

        <label>
          Nota interna
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Observações"
            maxLength={300}
          />
        </label>

        {error ? <span className="form-error">{error}</span> : null}

        <div className="editor-actions">
          <button type="button" className="small-primary" onClick={save} disabled={saving}>
            {saving ? "Salvando…" : "Salvar lançamento"}
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setOpen(false);
              reset();
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
