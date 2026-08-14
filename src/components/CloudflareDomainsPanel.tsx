"use client";

import { useState } from "react";

type DomainRow = {
  id: string;
  fqdn: string;
  cloudflarePlan: string | null;
  cloudflareStatus: string | null;
  dnsLastSyncedAt: string | null;
  dnsRecordCount: number;
  organizationName: string;
};

export default function CloudflareDomainsPanel({
  initialDomains,
}: {
  initialDomains: DomainRow[];
}) {
  const [domains, setDomains] = useState(initialDomains);
  const [status, setStatus] = useState<"idle" | "syncing" | "done">("idle");
  const [error, setError] = useState("");
  const [lastSummary, setLastSummary] = useState("");

  async function handleSync() {
    setStatus("syncing");
    setError("");

    try {
      const response = await fetch("/api/integrations/cloudflare/sync", { method: "POST" });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setError(data.error ?? "Falha ao sincronizar.");
      } else {
        setLastSummary(`${data.results.length} domínios sincronizados agora.`);
        const refreshed = await fetch("/api/integrations/cloudflare/domains");
        const refreshedData = await refreshed.json();
        setDomains(refreshedData.domains ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao sincronizar.");
    } finally {
      setStatus("done");
      window.setTimeout(() => setStatus("idle"), 2500);
    }
  }

  return (
    <article className="operations-panel module-panel">
      <div className="operations-panel-heading">
        <div>
          <span className="eyebrow">Cloudflare</span>
          <h2>Domínios e DNS</h2>
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={handleSync}
          disabled={status === "syncing"}
        >
          {status === "syncing" ? "Sincronizando..." : "Sincronizar agora"}
        </button>
      </div>

      {error ? (
        <div className="operations-empty compact-empty">
          <strong>Não foi possível sincronizar.</strong>
          <p>{error}</p>
        </div>
      ) : null}

      {lastSummary ? <small>{lastSummary}</small> : null}

      {domains.length === 0 ? (
        <div className="operations-empty compact-empty">
          <strong>Nenhum domínio sincronizado ainda.</strong>
          <p>Clique em &quot;Sincronizar agora&quot; para importar as zonas do Cloudflare.</p>
        </div>
      ) : (
        <div className="module-list">
          {domains.map((domain) => (
            <div className="module-row module-row-disabled" key={domain.id}>
              <div>
                <strong>{domain.fqdn}</strong>
                <small>
                  {domain.organizationName} · {domain.cloudflarePlan ?? "—"} ·{" "}
                  {domain.dnsRecordCount} registros DNS
                </small>
              </div>
              <span className={`module-state state-${domain.cloudflareStatus === "active" ? "active" : "next"}`}>
                {domain.cloudflareStatus ?? "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
