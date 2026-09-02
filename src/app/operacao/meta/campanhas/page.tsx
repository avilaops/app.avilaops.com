import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import MetaCampaignSyncButton from "@/components/MetaCampaignSyncButton";
import MetaClientSelect from "@/components/MetaClientSelect";
import MetaOperationsNav from "@/components/MetaOperationsNav";
import { getAdmin } from "@/lib/auth";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export default async function MetaCampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ organizationId?: string }>;
}) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const params = await searchParams;
  const organizations = await prisma.organization.findMany({
    where: { status: { not: "ARCHIVED" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, status: true },
  });
  const selectedOrganizationId = params.organizationId || organizations[0]?.id || "";

  const [adAccounts, snapshots] = selectedOrganizationId
    ? await Promise.all([
        prisma.metaAdAccount.findMany({
          where: { organizationId: selectedOrganizationId },
          orderBy: { name: "asc" },
          include: { businessAccount: true },
        }),
        prisma.metaCampaignSnapshot.findMany({
          where: { organizationId: selectedOrganizationId },
          orderBy: { capturedAt: "desc" },
          take: 100,
          include: { adAccount: true },
        }),
      ])
    : [[], []];

  const spend = snapshots.reduce(
    (total, snapshot) => total + Number(snapshot.spend ?? 0),
    0,
  );
  const impressions = snapshots.reduce(
    (total, snapshot) => total + (snapshot.impressions ?? 0),
    0,
  );
  const leads = snapshots.reduce((total, snapshot) => total + (snapshot.leads ?? 0), 0);

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="meta">
      <header className="page-header operations-header">
        <div>
          <h1>Campanhas da Meta</h1>
          <p>Verba, tráfego e resultado de cada campanha.</p>
        </div>
        <div className="page-actions">
          <MetaCampaignSyncButton organizationId={selectedOrganizationId} />
        </div>
      </header>

      <MetaOperationsNav active="campaigns" organizationId={selectedOrganizationId} />
      <MetaClientSelect
        organizations={organizations}
        selectedOrganizationId={selectedOrganizationId}
        action="/operacao/meta/campanhas"
      />

      <section className="operations-metrics metric-cards">
        <article className="operations-metric operations-metric-primary">
          <span>Investimento</span>
          <strong>{formatCurrency(spend)}</strong>
        </article>
        <article className="operations-metric">
          <span>Snapshots</span>
          <strong>{snapshots.length}</strong>
        </article>
        <article className="operations-metric">
          <span>Impressões</span>
          <strong>{impressions.toLocaleString("pt-BR")}</strong>
        </article>
        <article className="operations-metric">
          <span>Leads</span>
          <strong>{leads}</strong>
        </article>
      </section>

      <section className="operations-panel clients-panel">
        <div className="operations-panel-heading">
          <div>
            <h2>Snapshots de campanha</h2>
          </div>
          <small>Últimos 100 registros capturados</small>
        </div>

        {snapshots.length === 0 ? (
          <div className="operations-empty clients-empty">
            <span className="empty-index">00</span>
            <strong>Nenhum snapshot de campanha ainda.</strong>
            <p>O próximo passo técnico é ativar a coleta periódica de insights da Marketing API.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Campanha</th>
                  <th>Conta</th>
                  <th>Status</th>
                  <th>Objetivo</th>
                  <th>Gasto</th>
                  <th>Impressões</th>
                  <th>Cliques</th>
                  <th>Leads</th>
                  <th>Capturado</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((snapshot) => (
                  <tr key={snapshot.id}>
                    <td>{snapshot.campaignName ?? snapshot.campaignId}</td>
                    <td>{snapshot.adAccount?.name ?? "—"}</td>
                    <td>{snapshot.status ?? "—"}</td>
                    <td>{snapshot.objective ?? "—"}</td>
                    <td>{formatCurrency(snapshot.spend?.toString())}</td>
                    <td>{(snapshot.impressions ?? 0).toLocaleString("pt-BR")}</td>
                    <td>{(snapshot.clicks ?? 0).toLocaleString("pt-BR")}</td>
                    <td>{snapshot.leads ?? 0}</td>
                    <td>{formatDateTime(snapshot.capturedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="operations-panel clients-panel">
        <div className="operations-panel-heading">
          <div>
            <h2>Origem das campanhas</h2>
          </div>
          <small>{adAccounts.length} contas de anúncio importadas</small>
        </div>

        {adAccounts.length === 0 ? (
          <div className="operations-empty clients-empty">
            <span className="empty-index">00</span>
            <strong>Nenhuma conta de anúncio importada.</strong>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Conta</th>
                  <th>ID Meta</th>
                  <th>Business</th>
                  <th>Moeda</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {adAccounts.map((account) => (
                  <tr key={account.id}>
                    <td>{account.name}</td>
                    <td>{account.adAccountId}</td>
                    <td>{account.businessAccount?.name ?? "—"}</td>
                    <td>{account.currency ?? "—"}</td>
                    <td>{account.accountStatus ?? account.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
