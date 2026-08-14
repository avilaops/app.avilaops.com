"use client";

import { useState } from "react";

export default function MetaCampaignSyncButton({
  organizationId,
}: {
  organizationId: string;
}) {
  const [state, setState] = useState<"idle" | "syncing" | "done">("idle");
  const [message, setMessage] = useState("");

  async function syncCampaigns() {
    setState("syncing");
    setMessage("");

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
      setState("idle");
    }
  }

  return (
    <div className="inline-action-stack">
      <button
        className="primary-button"
        type="button"
        onClick={syncCampaigns}
        disabled={!organizationId || state === "syncing"}
      >
        {state === "syncing" ? "Coletando..." : "Coletar campanhas"}
      </button>
      {message ? <small>{message}</small> : null}
    </div>
  );
}
