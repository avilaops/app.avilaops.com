"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/shadcn/button";
import { toast } from "sonner";

export default function LedgerRowActions({
  entryId,
  status,
  direction,
}: {
  entryId: string;
  status: string;
  direction: "PAYABLE" | "RECEIVABLE";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(method: "PATCH" | "DELETE", body?: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/ledger-entries/${entryId}`, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Falha ao atualizar.");
      toast.success("Lançamento atualizado.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falhou.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="ledger-actions">
      {status === "OPEN" ? (
        <>
          <Button
            type="button"
            size="sm" className="min-h-11"
            disabled={busy} aria-busy={busy}
            onClick={() =>
              send("PATCH", { status: "PAID", paidAt: new Date().toISOString() })
            }
          >
            {direction === "PAYABLE" ? "Dar baixa" : "Recebi"}
          </Button>
          <Button
            type="button"
            variant="ghost" size="sm" className="min-h-11"
            disabled={busy} aria-busy={busy}
            onClick={() => send("DELETE")}
          >
            Cancelar
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="ghost" size="sm" className="min-h-11"
          disabled={busy} aria-busy={busy}
          onClick={() => send("PATCH", { status: "OPEN" })}
        >
          Reabrir
        </Button>
      )}
      {error ? <small role="alert" className="form-error">{error}</small> : null}
    </span>
  );
}
