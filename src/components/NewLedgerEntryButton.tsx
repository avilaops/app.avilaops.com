"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Icone } from "@/components/ui/Icones";
import Segmented from "@/components/ui/Segmented";
import Sheet from "@/components/ui/Sheet";

const todayIso = () => new Date().toISOString().slice(0, 10);

const direcoes = [
  ["RECEIVABLE", "A receber"],
  ["PAYABLE", "A pagar"],
] as const;

const escopos = [
  ["EMPRESA", "Empresa"],
  ["PESSOAL", "Pessoal"],
] as const;

/**
 * Botão "Novo lançamento" com a folha embutida. As telas de contas e de
 * crédito usam este; o cabeçalho do Financeiro abre a folha pelo menu de
 * ações, com `FolhaNovoLancamento` direto.
 */
export default function NewLedgerEntryButton() {
  const [open, setOpen] = useState(false);
  const fechar = useCallback(() => setOpen(false), []);
  return (
    <>
      <button
        type="button"
        className="secondary-button"
        onClick={() => setOpen(true)}
      >
        <Icone nome="adicionar" tamanho={18} />
        Novo lançamento
      </button>
      {open ? <FolhaNovoLancamento aoFechar={fechar} /> : null}
    </>
  );
}

/**
 * Lançamento manual (conta a pagar ou a receber) numa folha. Mesmos campos
 * da API; o que mudou foi a forma: um campo por linha, 48px de toque e o
 * "Salvar" fixo no rodapé. Montar é abrir, desmontar é fechar (ver `Sheet`),
 * então o formulário sempre começa limpo.
 */
export function FolhaNovoLancamento({ aoFechar }: { aoFechar: () => void }) {
  const router = useRouter();
  const [direction, setDirection] = useState<"PAYABLE" | "RECEIVABLE">(
    "RECEIVABLE",
  );
  const [description, setDescription] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(todayIso());
  const [category, setCategory] = useState("");
  const [scope, setScope] = useState<"EMPRESA" | "PESSOAL">("EMPRESA");
  const [currency, setCurrency] = useState("BRL");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fechar = aoFechar;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
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
          currency,
          scope,
          dueDate: dueDate ? new Date(`${dueDate}T12:00:00`).toISOString() : null,
          category: category || null,
          note: note || null,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Falha ao lançar.");

      toast.success("Lançamento salvo.");
      aoFechar();
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Não foi possível salvar.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      titulo="Novo lançamento"
      aoFechar={fechar}
      rodape={
        <>
          <button
            type="submit"
            form="lancamento-form"
            className="primary-button"
            disabled={saving}
          >
            {saving ? "Salvando…" : "Salvar lançamento"}
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
      <form id="lancamento-form" className="form-stack" onSubmit={save}>
        <p className="field-help">
          Registre uma conta a pagar ou a receber fora do fluxo do Éfi.
        </p>

        <div className="field">
          <span>Tipo</span>
          <Segmented
            opcoes={direcoes}
            valor={direction}
            aoMudar={setDirection}
            rotulo="Tipo de lançamento"
          />
        </div>

        <label className="field">
          <span>Descrição</span>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Ex.: Mensalidade cliente X"
            maxLength={200}
            required
            autoFocus
          />
        </label>

        <div className="field-grid">
          <label className="field">
            <span>Valor</span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0,00"
              required
              className="mono"
            />
          </label>
          <label className="field field-select">
            <span>Moeda</span>
            <select
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            >
              <option value="BRL">BRL</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </select>
            <Icone nome="chevron" tamanho={16} className="chevron" />
          </label>
        </div>

        <label className="field">
          <span>Vencimento</span>
          <input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </label>

        <label className="field">
          <span>Contraparte</span>
          <input
            value={counterparty}
            onChange={(event) => setCounterparty(event.target.value)}
            placeholder="Cliente ou fornecedor"
            maxLength={160}
          />
        </label>

        <div className="field">
          <span>Escopo</span>
          <Segmented
            opcoes={escopos}
            valor={scope}
            aoMudar={setScope}
            rotulo="Escopo do lançamento"
          />
        </div>

        <label className="field">
          <span>Categoria</span>
          <input
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="Ex.: Hospedagem, folha, imposto"
            maxLength={60}
          />
        </label>

        <label className="field">
          <span>Nota interna</span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Observações"
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
