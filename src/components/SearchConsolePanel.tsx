"use client";

import { useState } from "react";

type SitemapEntry = {
  path?: string | null;
  lastSubmitted?: string | null;
  isPending?: boolean | null;
  errors?: string | null;
};

type Connection = {
  id: string;
  status: string;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  metadata?: unknown;
} | null;

export default function SearchConsolePanel({
  siteUrl,
  sitemapUrl,
  initialConnection,
  initialSitemaps,
  initialError,
}: {
  siteUrl: string;
  sitemapUrl: string;
  initialConnection: Connection;
  initialSitemaps: SitemapEntry[];
  initialError?: string;
}) {
  const [connection, setConnection] = useState(initialConnection);
  const [sitemaps, setSitemaps] = useState(initialSitemaps);
  const [error, setError] = useState(initialError ?? "");
  const [status, setStatus] = useState<
    "idle" | "adding" | "verifying" | "auditing" | "sending" | "done"
  >("idle");

  async function refreshSearchConsole() {
    const refreshed = await fetch(
      `/api/integrations/search-console?siteUrl=${encodeURIComponent(siteUrl)}`,
    );
    const refreshedData = await refreshed.json();
    setConnection(refreshedData.connection ?? null);
    setSitemaps(refreshedData.sitemaps ?? []);
    if (refreshedData.error) setError(refreshedData.error);
  }

  async function handleAddSite() {
    setStatus("adding");
    setError("");

    try {
      const response = await fetch("/api/integrations/search-console/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setConnection(data.connection ?? null);
        setError(data.error ?? "Falha ao cadastrar a propriedade.");
      } else {
        setConnection(data.connection);
        await refreshSearchConsole();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao cadastrar a propriedade.");
    } finally {
      setStatus("done");
      window.setTimeout(() => setStatus("idle"), 2500);
    }
  }

  async function handleVerifyDomain() {
    setStatus("verifying");
    setError("");

    try {
      const response = await fetch("/api/integrations/search-console/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl }),
      });
      const data = await response.json();
      setConnection(data.connection ?? null);

      if (!response.ok || !data.ok) {
        setError(
          data.error ??
            "TXT criado, mas o Google ainda não confirmou a verificação.",
        );
      } else {
        await refreshSearchConsole();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao verificar o domínio.");
    } finally {
      setStatus("done");
      window.setTimeout(() => setStatus("idle"), 2500);
    }
  }

  async function handleAuditSitemap() {
    setStatus("auditing");
    setError("");

    try {
      const response = await fetch("/api/integrations/search-console/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl }),
      });
      const data = await response.json();
      setConnection(data.connection ?? null);

      if (!response.ok || !data.ok) {
        setError(data.audit?.error ?? data.error ?? "Sitemap público inválido.");
      } else {
        await refreshSearchConsole();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao auditar sitemap.");
    } finally {
      setStatus("done");
      window.setTimeout(() => setStatus("idle"), 2500);
    }
  }

  async function handleSubmit() {
    setStatus("sending");
    setError("");

    try {
      const response = await fetch("/api/integrations/search-console/sitemap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl, sitemapUrl }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setConnection(data.connection ?? null);
        setError(data.error ?? "Falha ao enviar o sitemap.");
      } else {
        setConnection(data.connection);
        await refreshSearchConsole();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao enviar o sitemap.");
    } finally {
      setStatus("done");
      window.setTimeout(() => setStatus("idle"), 2500);
    }
  }

  return (
    <article className="operations-panel">
      <div className="operations-panel-heading">
        <div>
          <span className="eyebrow">Google Search Console</span>
          <h2>{siteUrl}</h2>
        </div>
        <div className="panel-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={handleAddSite}
            disabled={status !== "idle"}
          >
            {status === "adding" ? "Cadastrando..." : "Cadastrar propriedade"}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={handleVerifyDomain}
            disabled={status !== "idle" || !siteUrl.startsWith("sc-domain:")}
          >
            {status === "verifying" ? "Verificando..." : "Criar TXT e verificar"}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={handleAuditSitemap}
            disabled={status !== "idle"}
          >
            {status === "auditing" ? "Auditando..." : "Auditar sitemap"}
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={handleSubmit}
            disabled={status !== "idle"}
          >
            {status === "sending" ? "Enviando..." : "Enviar sitemap agora"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="operations-empty compact-empty">
          <strong>Não foi possível consultar/enviar.</strong>
          <p>{error}</p>
          <small>
            Confirme se a service account tem acesso à propriedade no Search
            Console e se `GOOGLE_SERVICE_ACCOUNT_JSON` está configurado.
          </small>
        </div>
      ) : null}

      <dl>
        <div>
          <dt>Última sincronização</dt>
          <dd>
            {connection?.lastSyncedAt
              ? new Date(connection.lastSyncedAt).toLocaleString("pt-BR")
              : "Nunca sincronizado"}
          </dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd className={connection?.lastSyncStatus === "SUCCESS" ? "positive" : ""}>
            {connection?.lastSyncStatus ?? "—"}
          </dd>
        </div>
        <div>
          <dt>Propriedade</dt>
          <dd>{connection?.status ?? "Não registrada no Ávila OS"}</dd>
        </div>
      </dl>

      {sitemaps.length === 0 ? (
        <div className="operations-empty compact-empty">
          <strong>Nenhum sitemap registrado ainda no Search Console.</strong>
          <p>Clique em &quot;Enviar sitemap agora&quot; para registrar.</p>
        </div>
      ) : (
        <div className="attention-list">
          {sitemaps.map((sitemap) => (
            <div className="attention-row" key={sitemap.path}>
              <div>
                <strong>{sitemap.path}</strong>
                <small>
                  {sitemap.isPending ? "Processando" : "Processado"}
                  {sitemap.errors ? ` · ${sitemap.errors}` : ""}
                </small>
              </div>
              <span className="attention-type">
                {sitemap.lastSubmitted
                  ? new Date(sitemap.lastSubmitted).toLocaleDateString("pt-BR")
                  : "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
