"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, type FormEvent } from "react";
import { Icone } from "@/components/ui/Icones";
import Sheet from "@/components/ui/Sheet";

type Props = {
  transactionId: string;
  currentStatus: string;
  referenceType?: string | null;
  referenceId?: string | null;
  note?: string | null;
};

/**
 * Revisão de uma movimentação numa folha: estado, vínculo e nota. Antes era
 * um popover absoluto ao lado da linha, que no celular vazava para fora da
 * tela e no desktop fechava sem avisar ao rolar.
 */
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

  const fechar = useCallback(() => setOpen(false), []);
  const formId = `conciliacao-${transactionId}`;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
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
    <Sheet
      titulo="Revisar movimentação"
      aoFechar={fechar}
      rodape={
        <>
          <button
            type="submit"
            form={formId}
            className="primary-button"
            disabled={saving}
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={fechar}
            disabled={saving}
          >
            Cancelar
          </button>
        </>
      }
    >
      <form id={formId} className="form-stack" onSubmit={save}>
        <label className="field field-select">
          <span>Estado</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="PENDING">Pendente</option>
            <option value="REVIEW">Em revisão</option>
            <option value="MATCHED">Conciliado</option>
            <option value="IGNORED">Ignorado</option>
          </select>
          <Icone nome="chevron" tamanho={16} className="chevron" />
        </label>

        <div className="field-grid">
          <label className="field field-select">
            <span>Tipo de vínculo</span>
            <select value={type} onChange={(event) => setType(event.target.value)}>
              <option value="ORDER">Pedido</option>
              <option value="INVOICE">Fatura</option>
              <option value="EXPENSE">Despesa</option>
              <option value="MANUAL">Manual</option>
            </select>
            <Icone nome="chevron" tamanho={16} className="chevron" />
          </label>
          <label className="field">
            <span>Referência</span>
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="ID ou número"
              maxLength={120}
              autoComplete="off"
            />
          </label>
        </div>

        <label className="field">
          <span>Nota interna</span>
          <input
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Motivo ou evidência"
            maxLength={300}
          />
        </label>

        {error ? (
          <p className="inline-feedback feedback-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Sheet>
  );
}
