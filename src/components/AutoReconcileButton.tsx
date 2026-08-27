"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Result = {
  analyzed: number;
  matched: number;
  suggested: number;
};

/**
 * Dispara a conciliação automática.
 *
 * O primeiro clique é sempre simulação: rodar o casamento sobre um histórico
 * inteiro e só depois descobrir o que ele decidiu é o tipo de coisa que ninguém
 * quer desfazer à mão. Confirmado o número, o segundo clique aplica.
 */
export default function AutoReconcileButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "preview" | "done" | "error">("idle");
  const [preview, setPreview] = useState<Result | null>(null);
  const [message, setMessage] = useState("");

  async function run(dryRun: boolean) {
    setState("running");
    setMessage(dryRun ? "Procurando vínculos…" : "Aplicando vínculos…");

    try {
      const response = await fetch("/api/reconciliations/auto", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ days: 365, dryRun }),
      });
      const payload = (await response.json()) as Result & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Falha ao conciliar.");

      if (dryRun) {
        setPreview(payload);
        setState("preview");
        setMessage(
          payload.matched + payload.suggested === 0
            ? `Nenhum vínculo encontrado em ${payload.analyzed} movimentações.`
            : `${payload.matched} conciliações automáticas e ${payload.suggested} sugestões em ${payload.analyzed} movimentações.`,
        );
        return;
      }

      setState("done");
      setPreview(null);
      setMessage(
        `${payload.matched} movimentações conciliadas e ${payload.suggested} enviadas para revisão.`,
      );
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error ? error.message : "Não foi possível conciliar.",
      );
    }
  }

  return (
    <div className="sync-control">
      <button
        type="button"
        className="secondary-button"
        disabled={state === "running"}
        onClick={() => run(state === "preview")}
      >
        <span aria-hidden="true">⇄</span>
        {state === "running"
          ? "Processando"
          : state === "preview"
            ? "Aplicar conciliação"
            : "Conciliar automaticamente"}
      </button>
      {message ? (
        <span
          className={`sync-message sync-${state === "error" ? "error" : state === "done" ? "success" : "idle"}`}
          role={state === "error" ? "alert" : "status"}
        >
          {message}
          {state === "preview" && preview && preview.matched > 0
            ? " Confirme para gravar."
            : null}
        </span>
      ) : null}
    </div>
  );
}
