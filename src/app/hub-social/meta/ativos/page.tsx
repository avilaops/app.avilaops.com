import { redirect } from "next/navigation";
import MetaClientSelect from "@/components/MetaClientSelect";
import MetaOperationsNav from "@/components/MetaOperationsNav";
import { getAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export default async function MetaAssetsPage({
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

  const [businesses, pages, instagramAccounts, adAccounts] = selectedOrganizationId
    ? await Promise.all([
        prisma.metaBusinessAccount.findMany({
          where: { organizationId: selectedOrganizationId },
          orderBy: { name: "asc" },
        }),
        prisma.metaPage.findMany({
          where: { organizationId: selectedOrganizationId },
          orderBy: { name: "asc" },
          include: { instagramAccounts: true },
        }),
        prisma.instagramAccount.findMany({
          where: { organizationId: selectedOrganizationId },
          orderBy: { username: "asc" },
          include: { page: true },
        }),
        prisma.metaAdAccount.findMany({
          where: { organizationId: selectedOrganizationId },
          orderBy: { name: "asc" },
          include: { businessAccount: true },
        }),
      ])
    : [[], [], [], []];

  return (
    <>
      <header className="page-header operations-header">
        <div>
          <h1>Ativos da Meta</h1>
          <p>Business Managers, páginas, Instagram e contas de anúncio por organização.</p>
        </div>
      </header>

      <MetaOperationsNav active="assets" organizationId={selectedOrganizationId} />
      <MetaClientSelect
        organizations={organizations}
        selectedOrganizationId={selectedOrganizationId}
        action="/hub-social/meta/ativos"
      />

      <section className="operations-metrics metric-cards">
        <article className="operations-metric operations-metric-primary">
          <span>Business Managers</span>
          <strong>{businesses.length}</strong>
        </article>
        <article className="operations-metric">
          <span>Páginas</span>
          <strong>{pages.length}</strong>
        </article>
        <article className="operations-metric">
          <span>Instagram</span>
          <strong>{instagramAccounts.length}</strong>
        </article>
        <article className="operations-metric">
          <span>Ad accounts</span>
          <strong>{adAccounts.length}</strong>
        </article>
      </section>

      <section className="operations-panel clients-panel">
        <div className="operations-panel-heading">
          <div>
            <h2>Presença conectada</h2>
          </div>
          <small>Dados retornados pela Graph API</small>
        </div>

        {pages.length === 0 && instagramAccounts.length === 0 ? (
          <div className="operations-empty clients-empty">
            <span className="empty-index">00</span>
            <strong>Nenhuma página ou Instagram importado.</strong>
            <p>Conecte ou sincronize a Meta para preencher este inventário.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Nome</th>
                  <th>Identificador</th>
                  <th>Vínculo</th>
                  <th>Última sync</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((page) => (
                  <tr key={page.id}>
                    <td>Facebook Page</td>
                    <td>{page.name}</td>
                    <td>{page.username ?? page.pageId}</td>
                    <td>{page.instagramAccounts.length} Instagram</td>
                    <td>{formatDateTime(page.lastSyncedAt)}</td>
                  </tr>
                ))}
                {instagramAccounts.map((account) => (
                  <tr key={account.id}>
                    <td>Instagram</td>
                    <td>{account.name ?? account.username}</td>
                    <td>@{account.username}</td>
                    <td>{account.page?.name ?? "Sem página vinculada"}</td>
                    <td>{formatDateTime(account.lastSyncedAt)}</td>
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
            <h2>Contas de anúncio</h2>
          </div>
          <small>Base para métricas e campanhas</small>
        </div>

        {adAccounts.length === 0 ? (
          <div className="operations-empty clients-empty">
            <span className="empty-index">00</span>
            <strong>Nenhuma conta de anúncio importada.</strong>
            <p>A conta autorizada precisa ter acesso às ad accounts do cliente.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Conta</th>
                  <th>ID</th>
                  <th>Business</th>
                  <th>Moeda</th>
                  <th>Status</th>
                  <th>Última sync</th>
                </tr>
              </thead>
              <tbody>
                {adAccounts.map((account) => (
                  <tr key={account.id}>
                    <td>{account.name}</td>
                    <td>{account.adAccountId}</td>
                    <td>{account.businessAccount?.name ?? "-"}</td>
                    <td>{account.currency ?? "-"}</td>
                    <td>{account.accountStatus ?? account.status}</td>
                    <td>{formatDateTime(account.lastSyncedAt)}</td>
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
            <h2>Portfólios empresariais</h2>
          </div>
          <small>Origem dos ativos importados</small>
        </div>

        {businesses.length === 0 ? (
          <div className="operations-empty clients-empty">
            <span className="empty-index">00</span>
            <strong>Nenhum Business Manager importado.</strong>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>ID Meta</th>
                  <th>Verificação</th>
                  <th>Fuso</th>
                  <th>Última sync</th>
                </tr>
              </thead>
              <tbody>
                {businesses.map((business) => (
                  <tr key={business.id}>
                    <td>{business.name}</td>
                    <td>{business.businessId}</td>
                    <td>{business.verificationStatus ?? "-"}</td>
                    <td>{business.timezone ?? "-"}</td>
                    <td>{formatDateTime(business.lastSyncedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
