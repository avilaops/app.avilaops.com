"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ValidateResponse = {
  status: "SUCCESS" | "ERROR" | "NOT_CONFIGURED";
  error?: string;
  latencyMs?: number;
  estimatedCostUsd?: number;
};

export default function AiCoreValidateButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const [message, setMessage] = useState("");

  async function runValidation() {
    setState("running");
    setMessage("Chamando a OpenAI através do Core…");

    try {
      const response = await fetch("/api/internal/ai-core/validate", { method: "POST" });
      const result = (await response.json()) as ValidateResponse;

      if (result.status === "NOT_CONFIGURED") {
        setMessage("Credencial OpenAI ainda não configurada para a organização interna.");
      } else if (result.status === "SUCCESS") {
        setMessage(
          `Sucesso - ${result.latencyMs}ms, custo estimado $${result.estimatedCostUsd?.toFixed(6)}.`,
        );
      } else {
        setMessage(result.error ?? "Falha na validação.");
      }

      setState("done");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao validar.");
      setState("done");
    }
  }

  return (
    <div className="sync-control">
      <button
        type="button"
        className="secondary-button"
        disabled={state === "running"}
        onClick={runValidation}
      >
        <span aria-hidden="true">{state === "running" ? "↻" : "▶"}</span>
        {state === "running" ? "Validando" : "Validar Core agora"}
      </button>
      {message ? <span className="sync-message">{message}</span> : null}
    </div>
  );
}
