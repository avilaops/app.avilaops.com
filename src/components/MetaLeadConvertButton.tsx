"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import BadgeStatus from "@/components/sistema/Status";
import { Button } from "@/components/shadcn/button";

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
    return <BadgeStatus status="converted" texto="No CRM" tom="bom" />;
  }

  return (
    <span className="flex flex-col items-stretch gap-1 min-[821px]:items-end">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={state === "converting"}
        onClick={convertLead}
        className="min-h-11 text-[15px] min-[821px]:min-h-9 min-[821px]:text-sm"
      >
        {state === "converting" ? "Convertendo…" : "Converter"}
      </Button>
      {error ? (
        <span role="alert" className="text-[13px] leading-[1.4] text-[color:var(--red)]">
          {error}
        </span>
      ) : null}
    </span>
  );
}
