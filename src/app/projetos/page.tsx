import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import ProjectForm from "@/components/ProjectForm";
import { getAdmin } from "@/lib/auth";
import { formatShortDate } from "@/lib/format";
import { getOrganizationsForSelect, getProjects } from "@/lib/projects";

const statusLabels: Record<string, string> = {
  PLANNING: "Planejamento",
  ACTIVE: "Em execução",
  WAITING: "Em espera",
  DONE: "Concluído",
  CANCELLED: "Cancelado",
};

const statusFilters = ["PLANNING", "ACTIVE", "WAITING", "DONE"];

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; organizationId?: string }>;
}) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const params = await searchParams;
  const status = statusFilters.includes(params.status ?? "") ? params.status : undefined;
  const organizationId = params.organizationId || undefined;

  const [projects, organizations] = await Promise.all([
    getProjects({ status, organizationId }),
    getOrganizationsForSelect(),
  ]);

  const filterHref = (nextStatus?: string) => {
    const query = new URLSearchParams();
    if (nextStatus) query.set("status", nextStatus);
    if (organizationId) query.set("organizationId", organizationId);
    const suffix = query.toString();
    return suffix ? `/projetos?${suffix}` : "/projetos";
  };

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="projects">
      <header className="page-header">
        <div>
          <h1>Entregas</h1>
          <p>Projetos por cliente, com tarefas, prioridade e prazo.</p>
        </div>
        <ProjectForm organizations={organizations} />
      </header>

      <section className="client-summary-strip">
        <span>
          Projetos <strong>{projects.length}</strong>
        </span>
        <span>
          Tarefas abertas{" "}
          <strong>
            {projects.reduce((sum, item) => sum + item._count.tasks, 0)}
          </strong>
        </span>
      </section>

      <nav className="filter-strip" aria-label="Filtrar por estado">
        <Link href={filterHref()} className={!status ? "filter-chip filter-chip-active" : "filter-chip"}>
          Todos
        </Link>
        {statusFilters.map((item) => (
          <Link
            href={filterHref(item)}
            key={item}
            className={status === item ? "filter-chip filter-chip-active" : "filter-chip"}
          >
            {statusLabels[item]}
          </Link>
        ))}
      </nav>

      <section className="operations-panel clients-panel">
        <div className="operations-panel-heading">
          <div>
            <h2>Projetos cadastrados</h2>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="operations-empty clients-empty">
            <span className="empty-index">00</span>
            <strong>Nenhum projeto encontrado.</strong>
          </div>
        ) : (
          <div className="clients-list">
            {projects.map((project, index) => (
              <Link
                className="client-row project-row"
                href={`/projetos/${project.id}`}
                key={project.id}
              >
                <span className="client-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="client-identity">
                  <span className={`priority-dot priority-${project.priority.toLowerCase()}`} />
                  <div>
                    <strong>{project.title}</strong>
                    <small>
                      {project.organization.name}
                      {project.brand ? ` · ${project.brand.name}` : ""}
                    </small>
                  </div>
                </div>
                <dl className="client-signals project-signals">
                  <div>
                    <dt>Tarefas abertas</dt>
                    <dd>{project._count.tasks}</dd>
                  </div>
                  <div>
                    <dt>Responsável</dt>
                    <dd>{project.ownerName ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>Prazo</dt>
                    <dd>{project.dueAt ? formatShortDate(project.dueAt) : "-"}</dd>
                  </div>
                </dl>
                <span className={`status-pill status-${project.status.toLowerCase()}`}>
                  {statusLabels[project.status] ?? project.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
