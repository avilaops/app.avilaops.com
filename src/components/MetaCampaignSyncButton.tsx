"use client";

import { useState } from "react";
import { Button } from "@/components/shadcn/button";
import { cn } from "@/lib/utils";

export default function MetaCampaignSyncButton({
  organizationId,
}: {
  organizationId: string;
}) {
  const [state, setState] = useState<"idle" | "syncing" | "done">("idle");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function syncCampaigns() {
    setState("syncing");
    setMessage("");
    setFailed(false);

    try {
      const response = await fetch("/api/integrations/meta/campaigns/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Falha ao sincronizar campanhas.");
      }

      setMessage(
        `${data.result?.snapshots ?? 0} snapshots gerados de ${
          data.result?.campaigns ?? 0
        } campanhas consultadas.`,
      );
      setState("done");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao sincronizar campanhas.");
      setFailed(true);
      setState("idle");
    }
  }

  return (
    <div className="flex w-full flex-col min-[560px]:w-auto min-[560px]:items-end">
      <Button
        type="button"
        onClick={syncCampaigns}
        disabled={!organizationId || state === "syncing"}
        className="min-h-[50px] w-full text-[15px] min-[560px]:w-auto min-[821px]:min-h-10 min-[821px]:text-sm"
      >
        {state === "syncing" ? "Coletando…" : "Coletar campanhas"}
      </Button>
      <p
        role="status"
        className={cn(
          "text-[13px] leading-[1.4]",
          message && "mt-1.5",
          failed ? "text-[color:var(--red)]" : "text-muted-foreground",
        )}
      >
        {message}
      </p>
    </div>
  );
}
