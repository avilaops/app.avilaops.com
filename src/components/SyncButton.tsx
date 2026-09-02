"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SyncButton() {
  const router = useRouter();
  const [state, setState] = useState<
    "idle" | "syncing" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  type Resultado = { error?: string; receivedCount?: number; sentCount?: number };

  async function puxar(rota: string): Promise<Resultado> {
    const response = await fetch(rota, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ days: 90 }),
    });
    const result = (await response.json()) as Resultado;
    if (!response.ok) throw new Error(result.error ?? "Falha ao sincronizar");
    return result;
  }

  async function synchronize() {
    setState("syncing");
    setMessage("Consultando as contas…");

    // As duas contas são independentes: o Mercado Pago fora do ar não pode
    // impedir o extrato do Éfi de atualizar, nem o contrário. Por isso
    // allSettled, e a mensagem diz qual falhou.
    const [efi, mp] = await Promise.allSettled([
      puxar("/api/integrations/efi/sync"),
      puxar("/api/integrations/mercadopago/sync"),
    ]);

    const somar = (campo: "receivedCount" | "sentCount") =>
      [efi, mp].reduce(
        (total, r) => total + (r.status === "fulfilled" ? (r.value[campo] ?? 0) : 0),
        0,
      );

    const falhas: string[] = [];
    if (efi.status === "rejected") falhas.push(`Éfi: ${(efi.reason as Error).message}`);
    if (mp.status === "rejected") falhas.push(`Mercado Pago: ${(mp.reason as Error).message}`);

    if (falhas.length === 2) {
      setState("error");
      setMessage(falhas.join(" · "));
      return;
    }

    setState(falhas.length ? "error" : "success");
    setMessage(
      `${somar("receivedCount")} entradas e ${somar("sentCount")} saídas verificadas.` +
        (falhas.length ? ` ${falhas[0]}` : ""),
    );
    router.refresh();
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
