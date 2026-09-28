"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, type FormEvent } from "react";
import { Icone } from "@/components/ui/Icones";
import Segmented from "@/components/ui/Segmented";
import Sheet from "@/components/ui/Sheet";

type Props = {
  transactionId: string;
  currentStatus: string;
  referenceType?: string | null;
  referenceId?: string | null;
  note?: string | null;
  /** Identificador do Pix gravado pela sincronização; é contra ele que o comprovante é conferido. */
  endToEndId?: string | null;
  counterpartyName?: string | null;
  counterpartySource?: string | null;
  scope?: string;
};

/**
 * Revisão de uma movimentação numa folha: estado, vínculo e nota. Antes era
 * um popover absoluto ao lado da linha, que no celular vazava para fora da
 * tela e no desktop fechava sem avisar ao rolar.
 *
 * Quando a movimentação é um Pix sem pagador, a folha abre pelo comprovante:
 * é o único caminho que identifica quem pagou, e é o caso mais comum de linha
 * parada em "Pendente".
 *
 * Um caminho de cada vez, escolhido no topo. Os dois formulários ficavam
 * empilhados na mesma folha: três telas de rolagem, e o botão "Salvar" fixo
 * no rodapé era o do formulário de baixo — quem preenchia o comprovante e
 * tocava nele gravava a revisão manual e perdia o que tinha digitado. Agora o
 * rodapé tem o botão do caminho aberto, e só ele.
 */
export default function ReconciliationControl({
  transactionId,
  currentStatus,
  referenceType,
  referenceId,
  note,
  endToEndId,
  counterpartyName,
  counterpartySource,
  scope,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(currentStatus);
  const [reference, setReference] = useState(referenceId ?? "");
  const [type, setType] = useState(referenceType ?? "ORDER");
  const [comment, setComment] = useState(note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [identificador, setIdentificador] = useState("");
  const [pagador, setPagador] = useState(
    counterpartySource === "COMPROVANTE" ? (counterpartyName ?? "") : "",
  );
  const [documento, setDocumento] = useState("");
  const [gravandoComprovante, setGravandoComprovante] = useState(false);
  const [erroComprovante, setErroComprovante] = useState("");

  const fechar = useCallback(() => setOpen(false), []);
  const formId = `conciliacao-${transactionId}`;
  const formComprovante = `comprovante-${transactionId}`;
  // Sem identificador do lado do banco não há o que conferir, e a rota recusa.
  const aceitaComprovante = Boolean(endToEndId);
  // O comprovante abre na frente quando existe: é o caminho que resolve a
  // linha; a revisão à mão é a saída para quando ele não resolve.
  const [caminho, setCaminho] = useState<"comprovante" | "manual">(
    aceitaComprovante ? "comprovante" : "manual",
  );
  const noComprovante = aceitaComprovante && caminho === "comprovante";

  async function identificarPeloComprovante(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (gravandoComprovante) return;
    setGravandoComprovante(true);
    setErroComprovante("");
    try {
      const response = await fetch(
        `/api/reconciliations/${transactionId}/comprovante`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            identificador,
            pagador,
            documento: documento || null,
          }),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Falha ao conciliar");
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setErroComprovante(
        caught instanceof Error ? caught.message : "Não foi possível conciliar.",
      );
    } finally {
      setGravandoComprovante(false);
    }
  }

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
          {noComprovante ? (
            <button
              type="submit"
              form={formComprovante}
              className="primary-button"
              disabled={gravandoComprovante}
            >
              {gravandoComprovante ? "Conferindo…" : "Conferir e conciliar"}
            </button>
          ) : (
            <button
              type="submit"
              form={formId}
              className="primary-button"
              disabled={saving}
            >
              {saving ? "Salvando…" : "Salvar"}
            </button>
          )}
          <button
            type="button"
            className="secondary-button"
            onClick={fechar}
            disabled={saving || gravandoComprovante}
          >
            Cancelar
          </button>
        </>
      }
    >
      {aceitaComprovante ? (
        <div className="folha-caminhos">
          <Segmented
            rotulo="Como conciliar"
            valor={caminho}
            aoMudar={setCaminho}
            opcoes={[
              ["comprovante", "Pelo comprovante"],
              ["manual", "À mão"],
            ]}
          />
        </div>
      ) : null}

      {noComprovante ? (
        <form
          id={formComprovante}
          className="form-stack comprovante-bloco"
          onSubmit={identificarPeloComprovante}
        >
          {/* O porquê continua na folha, mas fechado: quem concilia todo dia
              já sabe, e quatro linhas de texto empurravam os campos para
              fora da tela. */}
          <details className="explicacao">
            <summary>Por que o identificador</summary>
            <p>
              O Efí não devolve quem pagou num Pix recebido. Cole o
              identificador impresso no comprovante: ele é conferido contra o
              do extrato antes de gravar — se for de outra transferência, não
              entra.
            </p>
          </details>

          <label className="field campo-identificador">
            <span>Identificador do comprovante</span>
            <input
              value={identificador}
              onChange={(event) => setIdentificador(event.target.value)}
              placeholder="E12345678202609182137ABCDEFGHIJK"
              spellCheck={false}
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={80}
              required
            />
          </label>

          <div className="field-grid">
            <label className="field">
              <span>Quem pagou</span>
              <input
                value={pagador}
                onChange={(event) => setPagador(event.target.value)}
                placeholder="Nome no comprovante"
                maxLength={160}
                autoComplete="off"
                required
              />
            </label>
            <label className="field">
              <span>CPF/CNPJ (se houver)</span>
              <input
                value={documento}
                onChange={(event) => setDocumento(event.target.value)}
                placeholder="Como está no comprovante"
                inputMode="numeric"
                maxLength={20}
                autoComplete="off"
              />
            </label>
          </div>

          {scope === "INDEFINIDO" ? (
            <p className="inline-feedback">
              Esta linha ainda está como “A classificar”: conciliar não a coloca
              no resultado da Ávila — marque o escopo como Empresa para isso.
            </p>
          ) : null}

          {erroComprovante ? (
            <p className="inline-feedback feedback-error" role="alert">
              {erroComprovante}
            </p>
          ) : null}
        </form>
      ) : null}

      <form
        id={formId}
        className="form-stack"
        hidden={noComprovante}
        onSubmit={save}
      >
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
              <option value="LEDGER">Conta a pagar/receber</option>
              <option value="COMPROVANTE">Comprovante Pix</option>
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
