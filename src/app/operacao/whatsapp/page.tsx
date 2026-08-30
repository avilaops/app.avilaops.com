import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getAdmin } from "@/lib/auth";
import { getWhatsappStatus } from "@/lib/whatsapp";

export default async function WhatsappOperationsPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const status = await getWhatsappStatus();
  const appUrl = (process.env.APP_URL || "https://app.avilaops.com").replace(/\/$/, "");
  const webhookUrl = `${appUrl}/api/webhooks/whatsapp`;
  const flowUrl = `${appUrl}/api/webhooks/whatsapp/flow`;
  const legacyWebhookUrl = `${appUrl}/webhook`;
  const legacyFlowUrl = `${appUrl}/flow-endpoint`;

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="whatsapp">
      <header className="page-header operations-header">
        <div>
          <h1>WhatsApp Business</h1>
          <p>Webhooks, Flows, catálogo e eventos da conta.</p>
        </div>
      </header>

      <section className="operations-metrics">
        <article className="operations-metric operations-metric-primary">
          <span>Configuração</span>
          <strong>{status.configured ? "Ativa" : "Pendente"}</strong>
        </article>
        <article className="operations-metric">
          <span>Flow endpoint</span>
          <strong>{status.flowConfigured ? "Ativo" : "Pendente"}</strong>
        </article>
        <article className="operations-metric">
          <span>Eventos</span>
          <strong>{status.events}</strong>
        </article>
        <article className="operations-metric">
          <span>Flows</span>
          <strong>{status.flowEvents}</strong>
        </article>
      </section>

      <section className="operations-grid">
        <article className="operations-panel">
          <div className="operations-panel-heading">
            <div>
              <h2>URLs oficiais</h2>
            </div>
            <small>{status.configured ? "Pronto para validação" : "Variáveis pendentes"}</small>
          </div>

          <dl>
            <div>
              <dt>Webhook Callback URL</dt>
              <dd>{webhookUrl}</dd>
            </div>
            <div>
              <dt>Verify Token</dt>
              <dd>WHATSAPP_VERIFY_TOKEN</dd>
            </div>
            <div>
              <dt>Flow endpoint</dt>
              <dd>{flowUrl}</dd>
            </div>
            <div>
              <dt>Compatibilidade webhook antigo</dt>
              <dd>{legacyWebhookUrl}</dd>
            </div>
            <div>
              <dt>Compatibilidade Flow antigo</dt>
              <dd>{legacyFlowUrl}</dd>
            </div>
          </dl>
        </article>

        <article className="operations-panel">
          <div className="operations-panel-heading">
            <div>
              <h2>Conexão WhatsApp</h2>
            </div>
          </div>

          <dl>
            <div>
              <dt>Phone Number ID</dt>
              <dd>{status.phoneNumberId}</dd>
            </div>
            <div>
              <dt>Catalog ID</dt>
              <dd>{status.catalogId}</dd>
            </div>
            <div>
              <dt>Conexões por cliente</dt>
              <dd>{status.connections}</dd>
            </div>
            <div>
              <dt>Último evento</dt>
              <dd>
                {status.latestEvent
                  ? `${status.latestEvent.eventType} · ${status.latestEvent.status} · ${new Date(
                      status.latestEvent.receivedAt,
                    ).toLocaleString("pt-BR")}`
                  : "Nenhum evento recebido"}
              </dd>
            </div>
          </dl>
        </article>
      </section>
    </AppShell>
  );
}
