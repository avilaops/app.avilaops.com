"use client";

import { useState } from "react";
import type { MetaConnectionStatus } from "@/lib/meta";

export default function MetaBusinessPanel({
  initialStatus,
  organizations,
  selectedOrganizationId,
  callbackUrl,
  webhookUrl,
  error,
  connected,
}: {
  initialStatus: MetaConnectionStatus;
  organizations: { id: string; name: string; status: string }[];
  selectedOrganizationId: string;
  callbackUrl: string;
  webhookUrl: string;
  error?: string;
  connected?: boolean;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [message, setMessage] = useState(
    connected ? "Meta Business conectado e sincronizado." : "",
  );
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(error ?? "");

  async function syncNow() {
    setSyncing(true);
    setSyncError("");
    setMessage("");

    try {
      const response = await fetch("/api/integrations/meta/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: selectedOrganizationId }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Falha ao sincronizar Meta.");
      }

      setStatus((current) => ({
        ...current,
        connected: true,
        connection: {
          ...(current.connection ?? {
            id: data.connection.id,
            status: data.connection.status,
            lastSyncedAt: null,
            lastSyncStatus: null,
            lastSyncError: null,
          }),
          status: data.connection.status,
          lastSyncedAt: data.connection.lastSyncedAt,
          lastSyncStatus: data.connection.lastSyncStatus,
          lastSyncError: data.connection.lastSyncError,
        },
        counts: {
          ...current.counts,
          businesses: current.counts.businesses + (data.imported?.businesses ?? 0),
          pages: current.counts.pages + (data.imported?.pages ?? 0),
          adAccounts: current.counts.adAccounts + (data.imported?.adAccounts ?? 0),
        },
      }));
      setMessage(
        `Sincronização enviada: ${data.imported?.businesses ?? 0} negócios, ${
          data.imported?.pages ?? 0
        } páginas e ${data.imported?.adAccounts ?? 0} contas de anúncio consultadas.`,
      );
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Falha ao sincronizar Meta.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <>
      <article className="operations-panel meta-connection-panel">
        <div className="operations-panel-heading">
          <div>
            <span className="eyebrow">Meta Business Suite</span>
            <h2>{status.connected ? "Integração conectada" : "Conectar app da Meta"}</h2>
          </div>
          <span className={`status-pill status-${status.connected ? "active" : "onboarding"}`}>
            {status.connected ? "ATIVO" : "PENDENTE"}
          </span>
        </div>

        {syncError ? (
          <div className="operations-empty compact-empty">
            <strong>Não foi possível concluir.</strong>
            <p>{syncError}</p>
          </div>
        ) : null}

        {message ? (
          <div className="operations-empty compact-empty">
            <strong>{message}</strong>
          </div>
        ) : null}

        {!status.configured ? (
          <div className="operations-empty compact-empty">
            <strong>Variáveis de ambiente pendentes.</strong>
            <p>
              Configure `META_APP_ID`, `META_APP_SECRET` e
              `META_TOKEN_ENCRYPTION_KEY` antes de abrir o OAuth.
            </p>
          </div>
        ) : null}

        <form className="meta-client-picker" method="get" action="/operacao/meta">
          <label>
            Cliente
            <select name="organizationId" defaultValue={selectedOrganizationId}>
              {organizations.map((organization) => (
                <option value={organization.id} key={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary-button" type="submit">
            Carregar cliente
          </button>
        </form>

        <dl>
          <div>
            <dt>Usuário conectado</dt>
            <dd>{status.connection?.userName ?? "Não conectado"}</dd>
          </div>
          <div>
            <dt>Última sincronização</dt>
            <dd>
              {status.connection?.lastSyncedAt
                ? new Date(status.connection.lastSyncedAt).toLocaleString("pt-BR")
                : "Nunca sincronizado"}
            </dd>
          </div>
          <div>
            <dt>Status técnico</dt>
            <dd>{status.connection?.lastSyncStatus ?? "—"}</dd>
          </div>
          <div>
            <dt>Expiração do token</dt>
            <dd>
              {status.connection?.tokenExpiresAt
                ? new Date(status.connection.tokenExpiresAt).toLocaleDateString("pt-BR")
                : "—"}
            </dd>
          </div>
        </dl>

        <div className="meta-actions">
          <a
            className={status.configured ? "primary-button" : "secondary-button"}
            href={`/api/integrations/meta/oauth/start?organizationId=${encodeURIComponent(
              selectedOrganizationId,
            )}`}
            aria-disabled={!status.configured}
          >
            {status.connected ? "Reconectar Meta" : "Conectar Meta"}
          </a>
          <button
            className="secondary-button"
            type="button"
            onClick={syncNow}
            disabled={!status.connected || syncing}
          >
            {syncing ? "Sincronizando..." : "Sincronizar agora"}
          </button>
        </div>
      </article>

      <aside className="operations-panel meta-setup-panel">
        <h2>URLs oficiais</h2>
        <dl>
          <div>
            <dt>OAuth Redirect URI</dt>
            <dd>{callbackUrl}</dd>
          </div>
          <div>
            <dt>Webhook Callback URL</dt>
            <dd>{webhookUrl}</dd>
          </div>
          <div>
            <dt>Verify Token</dt>
            <dd>META_WEBHOOK_VERIFY_TOKEN</dd>
          </div>
        </dl>
      </aside>

      <section className="operations-panel meta-counts-panel">
        <div className="operations-panel-heading">
          <div>
            <h2>Objetos da Meta no Postgres</h2>
          </div>
          <small>Contadores reais das tabelas `operations`.</small>
        </div>
        <div className="operations-metrics">
          <article className="operations-metric">
            <span>Business Managers</span>
            <strong>{status.counts.businesses}</strong>
          </article>
          <article className="operations-metric">
            <span>Páginas</span>
            <strong>{status.counts.pages}</strong>
          </article>
          <article className="operations-metric">
            <span>Instagram</span>
            <strong>{status.counts.instagramAccounts}</strong>
          </article>
          <article className="operations-metric">
            <span>Ad accounts</span>
            <strong>{status.counts.adAccounts}</strong>
          </article>
          <article className="operations-metric">
            <span>Lead forms</span>
            <strong>{status.counts.leadForms}</strong>
          </article>
          <article className="operations-metric">
            <span>Webhooks</span>
            <strong>{status.counts.webhookEvents}</strong>
          </article>
        </div>
      </section>
    </>
  );
}
