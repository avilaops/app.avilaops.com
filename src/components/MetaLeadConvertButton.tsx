"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ConversionState = "idle" | "converting" | "done";

export default function MetaLeadConvertButton({
  metaLeadId,
  converted,
}: {
  metaLeadId: string;
  converted: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<ConversionState>("idle");
  const [error, setError] = useState("");

  async function convertLead() {
    setState("converting");
    setError("");

    try {
      const response = await fetch(`/api/integrations/meta/leads/${metaLeadId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Falha ao converter lead.");
      }

      setState("done");
      router.refresh();
    } catch (conversionError) {
      setError(
        conversionError instanceof Error
          ? conversionError.message
          : "Falha ao converter lead.",
      );
      setState("idle");
    }
  }

  if (converted || state === "done") {
    return <span className="status-pill status-active">CRM</span>;
  }

  return (
    <span className="lead-convert-action">
      <button
        className="row-action"
        type="button"
        disabled={state === "converting"}
        onClick={convertLead}
      >
        {state === "converting" ? "Convertendo..." : "Converter"}
      </button>
      {error ? <small>{error}</small> : null}
    </span>
  );
}
