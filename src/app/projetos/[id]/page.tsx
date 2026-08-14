import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CopyLinkButton from "@/components/CopyLinkButton";
import DeliverableForm from "@/components/DeliverableForm";
import TaskQuickAdd from "@/components/TaskQuickAdd";
import TaskStatusControl from "@/components/TaskStatusControl";
import { getAdmin } from "@/lib/auth";
import { getDeliverablesForProject } from "@/lib/deliverables";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { getProjectDetail } from "@/lib/projects";

const statusLabels: Record<string, string> = {
  PLANNING: "Planejamento",
  ACTIVE: "Em execução",
  WAITING: "Em espera",
  DONE: "Concluído",
  CANCELLED: "Cancelado",
};

const deliverableStatusLabels: Record<string, string> = {
  DRAFT: "Rascunho",
  PUBLISHED: "Aguardando pagamento",
  PAID: "Pago",
  CANCELLED: "Cancelado",
};

const priorityLabels: Record<string, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  URGENT: "Urgente",
};

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const { id } = await params;
  const project = await getProjectDetail(id);
  if (!project) notFound();

  const openTasks = project.tasks.filter((task) => task.status !== "DONE");
  const doneTasks = project.tasks.filter((task) => task.status === "DONE");
  const deliverables = await getDeliverablesForProject(project.id);

  return (
    <AppShell adminName={admin.nome} section="projects">
      <header className="page-header">
        <div>
          <span className="eyebrow">
            <Link href="/projetos" className="text-link">
              Entregas
            </Link>{" "}
            · {project.organization.name}
            {project.brand ? ` · ${project.brand.name}` : ""}
          </span>
          <h1>{project.title}</h1>
          <p>
            {priorityLabels[project.priority] ?? project.priority} prioridade
            {project.ownerName ? ` · responsável ${project.ownerName}` : ""}
            {project.dueAt ? ` · prazo ${formatShortDate(project.dueAt)}` : ""}
          </p>
        </div>
        <span className={`status-pill status-${project.status.toLowerCase()}`}>
          {statusLabels[project.status] ?? project.status}
        </span>
      </header>

      <section className="operations-panel task-panel">
        <div className="operations-panel-heading">
          <div>
            <span className="eyebrow">Checklist executável</span>
            <h2>Tarefas abertas</h2>
          </div>
          <span className="panel-count">{openTasks.length}</span>
        </div>

        <TaskQuickAdd projectId={project.id} />

        {openTasks.length === 0 ? (
          <div className="operations-empty compact-empty">
            <strong>Nenhuma tarefa aberta.</strong>
            <p>Adicione a primeira tarefa acima para iniciar a execução.</p>
          </div>
        ) : (
          <div className="task-list">
            {openTasks.map((task) => (
              <div className="task-row" key={task.id}>
                <span
                  className={`attention-marker marker-${task.priority.toLowerCase()}`}
                />
                <div>
                  <strong>{task.title}</strong>
                  <small>{task.ownerName ?? "Sem responsável"}</small>
                </div>
                <time dateTime={task.dueAt?.toISOString()}>
                  {task.dueAt ? formatShortDate(task.dueAt) : "Sem prazo"}
                </time>
                <TaskStatusControl taskId={task.id} status={task.status} />
              </div>
            ))}
          </div>
        )}

        {doneTasks.length > 0 ? (
          <details className="task-done-details">
            <summary>{doneTasks.length} tarefa(s) concluída(s)</summary>
            <div className="task-list">
              {doneTasks.map((task) => (
                <div className="task-row task-row-done" key={task.id}>
                  <span className="attention-marker marker-done" />
                  <div>
                    <strong>{task.title}</strong>
                    <small>
                      {task.completedAt
                        ? `Concluída em ${formatShortDate(task.completedAt)}`
                        : "Concluída"}
                    </small>
                  </div>
                  <time>—</time>
                  <TaskStatusControl taskId={task.id} status={task.status} />
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </section>

      <section className="operations-panel task-panel">
        <div className="operations-panel-heading">
          <div>
            <span className="eyebrow">Prévia gratuita, download pago</span>
            <h2>Entregáveis</h2>
          </div>
          <DeliverableForm projectId={project.id} />
        </div>

        {deliverables.length === 0 ? (
          <div className="operations-empty compact-empty">
            <strong>Nenhum entregável criado.</strong>
            <p>
              Crie um entregável para gerar um link público com prévia e
              pagamento (PIX, boleto ou cartão) antes da liberação do arquivo.
            </p>
          </div>
        ) : (
          <div className="task-list">
            {deliverables.map((deliverable) => (
              <div className="task-row deliverable-row" key={deliverable.id}>
                <span
                  className={`attention-marker ${
                    deliverable.status === "PAID" ? "marker-done" : "marker-medium"
                  }`}
                />
                <div>
                  <strong>{deliverable.title}</strong>
                  <small>{formatCurrency(deliverable.amount.toString())}</small>
                </div>
                <span className={`status-pill status-${deliverable.status.toLowerCase()}`}>
                  {deliverableStatusLabels[deliverable.status] ?? deliverable.status}
                </span>
                <CopyLinkButton path={`/entrega/${deliverable.accessToken}`} />
              </div>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
