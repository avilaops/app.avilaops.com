"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SyncButton() {
  const router = useRouter();
  const [state, setState] = useState<
    "idle" | "syncing" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  async function synchronize() {
    setState("syncing");
    setMessage("Consultando o Éfi com segurança…");

    try {
      const response = await fetch("/api/integrations/efi/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ days: 90 }),
      });
      const result = (await response.json()) as {
        error?: string;
        receivedCount?: number;
        sentCount?: number;
      };

      if (!response.ok) throw new Error(result.error ?? "Falha ao sincronizar");

      setState("success");
      setMessage(
        `${result.receivedCount ?? 0} entradas e ${result.sentCount ?? 0} saídas verificadas.`,
      );
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error ? error.message : "Não foi possível sincronizar.",
      );
    }
  }

  return (
    <div className="sync-control">
      <button
        type="button"
        className="primary-button"
        disabled={state === "syncing"}
        onClick={synchronize}
      >
        <span aria-hidden="true">{state === "syncing" ? "↻" : "↗"}</span>
        {state === "syncing" ? "Sincronizando" : "Sincronizar agora"}
      </button>
      {message ? (
        <span
          className={`sync-message sync-${state}`}
          role={state === "error" ? "alert" : "status"}
        >
          {message}
        </span>
      ) : null}
    </div>
  );
}
