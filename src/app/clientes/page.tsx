import { redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import OrganizationForm from "@/components/OrganizationForm";
import { getAdmin } from "@/lib/auth";
import { getOrganizations } from "@/lib/operations";

const statusLabels: Record<string, string> = {
  ACTIVE: "Ativo",
  ONBOARDING: "Onboarding",
  PAUSED: "Pausado",
  ARCHIVED: "Arquivado",
};

export default async function ClientsPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  const organizations = await getOrganizations();

  return (
    <AppShell adminName={admin.nome} section="clients">
      <header className="page-header">
        <div>
          <h1>Clientes</h1>
          <p>Organizações, marcas e o que está aberto em cada uma.</p>
        </div>
        <OrganizationForm />
      </header>

      <section className="client-summary-strip">
        <span>
          Organizações <strong>{organizations.length}</strong>
        </span>
        <span>
          Em onboarding{" "}
          <strong>
            {organizations.filter((item) => item.status === "ONBOARDING").length}
          </strong>
        </span>
        <span>
          Marcas{" "}
          <strong>
            {organizations.reduce((sum, item) => sum + item._count.brands, 0)}
          </strong>
        </span>
        <span>
          Projetos{" "}
          <strong>
            {organizations.reduce((sum, item) => sum + item._count.projects, 0)}
          </strong>
        </span>
      </section>

      <section className="operations-panel clients-panel">
        <div className="operations-panel-heading">
          <div>
            <h2>Organizações cadastradas</h2>
          </div>
          <small>Sem dados de demonstração</small>
        </div>

        {organizations.length === 0 ? (
          <div className="operations-empty clients-empty">
            <span className="empty-index">00</span>
            <strong>Nenhum cliente cadastrado.</strong>
            <p>
              Use “Adicionar cliente” para criar a primeira organização. O
              cadastro começa com dados mínimos e abre espaço para um onboarding
              controlado.
            </p>
          </div>
        ) : (
          <div className="clients-list">
            {organizations.map((organization, index) => (
              <article className="client-row" key={organization.id}>
                <span className="client-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="client-identity">
                  <span>{organization.name.slice(0, 2).toUpperCase()}</span>
                  <div>
                    <Link className="client-name-link" href={`/clientes/${organization.id}`}>
                      {organization.name}
                    </Link>
                    <small>
                      {organization.legalName ??
                        organization.segment ??
                        "Contexto a completar"}
                    </small>
                  </div>
                </div>
                <dl className="client-signals">
                  <div>
                    <dt>Marcas</dt>
                    <dd>{organization._count.brands}</dd>
                  </div>
                  <div>
                    <dt>Projetos</dt>
                    <dd>{organization._count.projects}</dd>
                  </div>
                  <div>
                    <dt>Tarefas</dt>
                    <dd>{organization._count.tasks}</dd>
                  </div>
                  <div>
                    <dt>Domínios</dt>
                    <dd>{organization._count.domains}</dd>
                  </div>
                </dl>
                <span className={`status-pill status-${organization.status.toLowerCase()}`}>
                  {statusLabels[organization.status] ?? organization.status}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
