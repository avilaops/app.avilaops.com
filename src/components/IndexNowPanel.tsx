"use client";

import { useState } from "react";

type Connection = {
  id: string;
  status: string;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  metadata?: unknown;
} | null;

function metadataValue(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export default function IndexNowPanel({
  fqdn,
  initialConnection,
}: {
  fqdn: string;
  initialConnection: Connection;
}) {
  const [connection, setConnection] = useState(initialConnection);
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [message, setMessage] = useState("");
  const [batchMessage, setBatchMessage] = useState("");

  async function submitIndexNow() {
    setStatus("sending");
    setMessage("");

    try {
      const response = await fetch("/api/integrations/indexnow/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fqdn }),
      });
      const data = await response.json();
      setConnection(data.connection ?? null);

      if (!response.ok || !data.ok) {
        setMessage(
          data.keyAudit?.error ??
            data.error ??
            "Não foi possível enviar URLs ao IndexNow.",
        );
      } else {
        setMessage(`${data.submitted ?? 0} URLs enviadas ao IndexNow.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha no envio IndexNow.");
    } finally {
      setStatus("done");
      window.setTimeout(() => setStatus("idle"), 2500);
    }
  }

  async function submitAllIndexNow() {
    setStatus("sending");
    setBatchMessage("");

    try {
      const response = await fetch("/api/integrations/indexnow/submit-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();
      setBatchMessage(
        `${data.successful ?? 0}/${data.total ?? 0} domínios enviados. ${
          data.failed ? `${data.failed} exigem correção.` : ""
        }`,
      );
    } catch (error) {
      setBatchMessage(
        error instanceof Error ? error.message : "Falha no envio em lote.",
      );
    } finally {
      setStatus("done");
      window.setTimeout(() => setStatus("idle"), 2500);
    }
  }

  const submittedCount = metadataValue(connection?.metadata, "submittedCount");
  const keyLocation = metadataValue(connection?.metadata, "keyLocation");
  const canonicalHost = metadataValue(connection?.metadata, "canonicalHost");

  return (
    <article className="operations-panel">
      <div className="operations-panel-heading">
        <div>
          <span className="eyebrow">Bing e IndexNow</span>
          <h2>{fqdn}</h2>
        </div>
        <div className="panel-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={submitAllIndexNow}
            disabled={status !== "idle"}
          >
            {status === "sending" ? "Enviando..." : "Enviar todos"}
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={submitIndexNow}
            disabled={status !== "idle"}
          >
            {status === "sending" ? "Enviando..." : "Enviar URLs agora"}
          </button>
        </div>
      </div>

      {message ? (
        <div className="operations-empty compact-empty">
          <strong>{connection?.lastSyncStatus === "SUCCESS" ? "Envio concluído." : "Ação necessária."}</strong>
          <p>{message}</p>
        </div>
      ) : null}

      {batchMessage ? (
        <div className="operations-empty compact-empty">
          <strong>Envio em lote concluído.</strong>
          <p>{batchMessage}</p>
        </div>
      ) : null}

      <dl>
        <div>
          <dt>Último envio</dt>
          <dd>
            {connection?.lastSyncedAt
              ? new Date(connection.lastSyncedAt).toLocaleString("pt-BR")
              : "Nunca enviado"}
          </dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd className={connection?.lastSyncStatus === "SUCCESS" ? "positive" : ""}>
            {connection?.lastSyncStatus ?? "—"}
          </dd>
        </div>
        <div>
          <dt>URLs enviadas</dt>
          <dd>
            {connection?.lastSyncStatus === "REDIRECT_DOMAIN" && canonicalHost
              ? `Canônico: ${canonicalHost}`
              : submittedCount || "—"}
          </dd>
        </div>
        <div>
          <dt>Arquivo de chave</dt>
          <dd>{keyLocation || `https://${fqdn}/[INDEXNOW_KEY].txt`}</dd>
        </div>
      </dl>
    </article>
  );
}
