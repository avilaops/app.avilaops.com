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

function metadataArrayLength(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.length : null;
}

export default function BingWebmasterPanel({
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

  async function submitBing() {
    setStatus("sending");
    setMessage("");

    try {
      const response = await fetch("/api/integrations/bing-webmaster/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fqdn }),
      });
      const data = await response.json();
      const result = data.result;

      setConnection({
        id: connection?.id ?? "bing_webmaster",
        status: result?.success ? "ACTIVE" : "FAIL",
        lastSyncedAt: result?.submittedAt ?? null,
        lastSyncStatus: result?.success ? "SUCCESS" : "ERROR",
        lastSyncError: result?.error ?? null,
        metadata: result,
      });

      if (!response.ok || !result?.success) {
        setMessage(result?.error ?? "Não foi possível enviar URLs ao Bing Webmaster.");
      } else {
        setMessage(`${result.urlsSubmitted?.length ?? 0} URLs enviadas ao Bing.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha no envio ao Bing.");
    } finally {
      setStatus("done");
      window.setTimeout(() => setStatus("idle"), 2500);
    }
  }

  async function submitAllBing() {
    setStatus("sending");
    setBatchMessage("");

    try {
      const response = await fetch("/api/integrations/bing-webmaster/run", {
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
      setBatchMessage(error instanceof Error ? error.message : "Falha no envio em lote.");
    } finally {
      setStatus("done");
      window.setTimeout(() => setStatus("idle"), 2500);
    }
  }

  const submittedCount = metadataArrayLength(connection?.metadata, "urlsSubmitted");

  return (
    <article className="operations-panel">
      <div className="operations-panel-heading">
        <div>
          <span className="eyebrow">Bing Webmaster Tools</span>
          <h2>{fqdn}</h2>
        </div>
        <div className="panel-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={submitAllBing}
            disabled={status !== "idle"}
          >
            {status === "sending" ? "Enviando..." : "Enviar todos"}
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={submitBing}
            disabled={status !== "idle"}
          >
            {status === "sending" ? "Enviando..." : "Enviar sitemap agora"}
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
            {connection?.lastSyncStatus ?? "-"}
          </dd>
        </div>
        <div>
          <dt>URLs enviadas</dt>
          <dd>{submittedCount ?? "-"}</dd>
        </div>
      </dl>
    </article>
  );
}
