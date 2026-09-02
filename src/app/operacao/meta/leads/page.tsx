import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import MetaClientSelect from "@/components/MetaClientSelect";
import MetaLeadConvertButton from "@/components/MetaLeadConvertButton";
import MetaOperationsNav from "@/components/MetaOperationsNav";
import { getAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";

function countJsonItems(value: unknown) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return 0;
}

export default async function MetaLeadsPage({
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

  const [forms, leads] = selectedOrganizationId
    ? await Promise.all([
        prisma.metaLeadForm.findMany({
          where: { organizationId: selectedOrganizationId },
          orderBy: [{ status: "asc" }, { name: "asc" }],
          include: { page: true, adAccount: true },
        }),
        prisma.metaLead.findMany({
          where: { organizationId: selectedOrganizationId },
          orderBy: { createdTime: "desc" },
          take: 80,
          include: { form: true, page: true, adAccount: true, lead: true },
        }),
      ])
    : [[], []];

  const newLeads = leads.filter((lead) => lead.processingStatus === "NEW").length;
  const convertedLeads = leads.filter((lead) => Boolean(lead.leadId)).length;

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="meta">
      <header className="page-header operations-header">
        <div>
          <h1>Leads da Meta</h1>
          <p>Formulários, leads recebidos e status de processamento.</p>
        </div>
      </header>

      <MetaOperationsNav active="leads" organizationId={selectedOrganizationId} />
      <MetaClientSelect
        organizations={organizations}
        selectedOrganizationId={selectedOrganizationId}
        action="/operacao/meta/leads"
      />

      <section className="operations-metrics metric-cards">
        <article className="operations-metric operations-metric-primary">
          <span>Formulários</span>
          <strong>{forms.length}</strong>
        </article>
        <article className="operations-metric">
          <span>Leads importados</span>
          <strong>{leads.length}</strong>
        </article>
        <article className="operations-metric">
          <span>Novos</span>
          <strong>{newLeads}</strong>
        </article>
        <article className="operations-metric">
          <span>Convertidos no CRM</span>
          <strong>{convertedLeads}</strong>
        </article>
      </section>

      <section className="operations-panel clients-panel">
        <div className="operations-panel-heading">
          <div>
            <h2>Fontes de captação</h2>
          </div>
          <small>Lead Ads disponíveis por cliente</small>
        </div>

        {forms.length === 0 ? (
          <div className="operations-empty clients-empty">
            <span className="empty-index">00</span>
            <strong>Nenhum formulário importado.</strong>
            <p>O próximo passo é sincronizar formulários das páginas conectadas.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Formulário</th>
                  <th>Status</th>
                  <th>Página</th>
                  <th>Conta de anúncio</th>
                  <th>Perguntas</th>
                  <th>Última sync</th>
                </tr>
              </thead>
              <tbody>
                {forms.map((form) => (
                  <tr key={form.id}>
                    <td>{form.name}</td>
                    <td>{form.status}</td>
                    <td>{form.page?.name ?? "—"}</td>
                    <td>{form.adAccount?.name ?? "—"}</td>
                    <td>{countJsonItems(form.questions)}</td>
                    <td>{formatDateTime(form.lastSyncedAt)}</td>
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
            <h2>Fila operacional</h2>
          </div>
          <small>Últimos 80 registros importados</small>
        </div>

        {leads.length === 0 ? (
          <div className="operations-empty clients-empty">
            <span className="empty-index">00</span>
            <strong>Nenhum lead recebido ainda.</strong>
            <p>Quando o webhook estiver ativo, os leads entram aqui antes de virar atendimento.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Criado na Meta</th>
                  <th>Status</th>
                  <th>Formulário</th>
                  <th>Página</th>
                  <th>Campos</th>
                  <th>CRM</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td>{formatDateTime(lead.createdTime)}</td>
                    <td>{lead.processingStatus}</td>
                    <td>{lead.form?.name ?? lead.leadgenId}</td>
                    <td>{lead.page?.name ?? "—"}</td>
                    <td>{countJsonItems(lead.fieldData)}</td>
                    <td>{lead.lead?.companyName ?? lead.lead?.contactName ?? "Aguardando"}</td>
                    <td>
                      <MetaLeadConvertButton
                        metaLeadId={lead.id}
                        converted={Boolean(lead.leadId)}
                      />
                    </td>
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
