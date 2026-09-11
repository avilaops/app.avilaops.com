"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, type FormEvent } from "react";
import { Icone } from "@/components/ui/Icones";
import Segmented from "@/components/ui/Segmented";
import Sheet from "@/components/ui/Sheet";
import { BUREAU_LABELS, BUREAUS, type Bureau, type SubjectKind } from "@/lib/credito";

const todayIso = () => new Date().toISOString().slice(0, 10);

const sujeitos = [
  ["CPF", "CPF"],
  ["CNPJ", "CNPJ"],
] as const;

/**
 * Registrar uma leitura de score numa folha: de quem é, de onde veio, o
 * número e a data em que foi lido. A leitura é o que a pessoa viu no app do
 * birô ou do banco; a tela não inventa.
 */
export default function RegistrarScoreButton({
  sujeitoInicial = "CPF",
}: {
  sujeitoInicial?: SubjectKind;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subjectKind, setSubjectKind] = useState<SubjectKind>(sujeitoInicial);
  const [bureau, setBureau] = useState<Bureau>("SERASA");
  const [score, setScore] = useState("");
  const [maxScore, setMaxScore] = useState("1000");
  const [readAt, setReadAt] = useState(todayIso());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fechar = useCallback(() => {
    setOpen(false);
    setScore("");
    setNote("");
    setError("");
    setReadAt(todayIso());
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/credit-scores", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectKind,
          bureau,
          score: Number.parseInt(score, 10),
          maxScore: Number.parseInt(maxScore, 10),
          readAt: readAt ? new Date(`${readAt}T12:00:00`).toISOString() : null,
          note: note || null,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Falha ao registrar.");
      fechar();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="primary-button"
        onClick={() => {
          setSubjectKind(sujeitoInicial);
          setOpen(true);
        }}
      >
        <Icone nome="adicionar" tamanho={18} />
        Registrar score
      </button>
    );
  }

  return (
    <Sheet
      titulo="Registrar leitura de score"
      aoFechar={fechar}
      rodape={
        <>
          <button type="submit" form="score-form" className="primary-button" disabled={saving}>
            {saving ? "Salvando…" : "Salvar leitura"}
          </button>
          <button type="button" className="secondary-button" onClick={fechar} disabled={saving}>
            Cancelar
          </button>
        </>
      }
    >
      <form id="score-form" className="form-stack" onSubmit={save}>
        <p className="field-help">
          Abra o Serasa, a Boa Vista ou o app do banco, leia o número e registre
          aqui com a data.
        </p>

        <div className="field">
          <span>De quem</span>
          <Segmented
            opcoes={sujeitos}
            valor={subjectKind}
            aoMudar={setSubjectKind}
            rotulo="CPF ou CNPJ"
          />
        </div>

        <label className="field field-select">
          <span>Onde leu</span>
          <select value={bureau} onChange={(event) => setBureau(event.target.value as Bureau)}>
            {BUREAUS.map((item) => (
              <option key={item} value={item}>
                {BUREAU_LABELS[item]}
              </option>
            ))}
          </select>
          <Icone nome="chevron" tamanho={16} className="chevron" />
        </label>

        <div className="field-grid">
          <label className="field">
            <span>Score</span>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              value={score}
              onChange={(event) => setScore(event.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="Ex.: 812"
              required
              autoFocus
              className="mono"
            />
          </label>
          <label className="field field-select">
            <span>Escala</span>
            <select value={maxScore} onChange={(event) => setMaxScore(event.target.value)}>
              <option value="1000">0 a 1000</option>
              <option value="100">0 a 100</option>
            </select>
            <Icone nome="chevron" tamanho={16} className="chevron" />
          </label>
        </div>

        <label className="field">
          <span>Data da leitura</span>
          <input
            type="date"
            value={readAt}
            max={todayIso()}
            onChange={(event) => setReadAt(event.target.value)}
            required
          />
        </label>

        <label className="field">
          <span>Nota</span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Ex.: caiu depois do atraso do cartão"
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
