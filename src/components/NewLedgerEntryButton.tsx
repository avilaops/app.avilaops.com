"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, type FormEvent } from "react";
import { Icone } from "@/components/ui/Icones";
import Segmented from "@/components/ui/Segmented";
import Sheet from "@/components/ui/Sheet";
import {
  CONTA_A_CLASSIFICAR,
  contaPorCodigo,
  contasDoGrupo,
  GRUPOS_DRE,
} from "@/lib/plano-de-contas";

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
 * Lançamento manual (conta a pagar ou a receber) numa folha. Mesmos campos
 * da API; o que mudou foi a forma: um campo por linha, 48px de toque e o
 * "Salvar" fixo no rodapé.
 */
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
  const [accountCode, setAccountCode] = useState<string>(CONTA_A_CLASSIFICAR);
  const [competenceStart, setCompetenceStart] = useState("");
  const [competenceMonths, setCompetenceMonths] = useState("1");
  const [scope, setScope] = useState<"EMPRESA" | "PESSOAL">("EMPRESA");
  const [currency, setCurrency] = useState("BRL");
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
    setAccountCode(CONTA_A_CLASSIFICAR);
    setCompetenceStart("");
    setCompetenceMonths("1");
    setScope("EMPRESA");
    setCurrency("BRL");
    setNote("");
    setError("");
  }

  const fechar = useCallback(() => {
    setOpen(false);
    reset();
  }, []);

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
          accountCode,
          competenceStart: competenceStart
            ? new Date(`${competenceStart}T12:00:00`).toISOString()
            : null,
          competenceMonths: Number.parseInt(competenceMonths, 10) || 1,
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
        <Icone nome="adicionar" tamanho={18} />
        Novo lançamento
      </button>
    );
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

        <label className="field field-select">
          <span>Conta do resultado</span>
          <select
            value={accountCode}
            onChange={(event) => setAccountCode(event.target.value)}
          >
            {GRUPOS_DRE.map(({ grupo, rotulo }) => {
              const contas = contasDoGrupo(grupo);
              if (contas.length === 0) return null;
              return (
                <optgroup key={grupo} label={rotulo}>
                  {contas.map((conta) => (
                    <option key={conta.codigo} value={conta.codigo}>
                      {conta.rotulo}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          <Icone nome="chevron" tamanho={16} className="chevron" />
        </label>
        <p className="field-help">
          {contaPorCodigo(accountCode)?.ajuda ??
            "É por esta conta que o lançamento entra no DRE."}
        </p>

        {/* Competência separa o fato do pagamento: o domínio anual pago de uma
            vez é caixa de um mês e despesa de doze. Em branco, vale o
            vencimento — que é como tudo se comportava antes. */}
        <div className="field-grid">
          <label className="field">
            <span>Competência a partir de</span>
            <input
              type="date"
              value={competenceStart}
              onChange={(event) => setCompetenceStart(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Em quantos meses</span>
            <input
              inputMode="numeric"
              value={competenceMonths}
              onChange={(event) => setCompetenceMonths(event.target.value)}
              placeholder="1"
              className="mono"
            />
          </label>
        </div>

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
