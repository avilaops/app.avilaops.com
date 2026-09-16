import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { Icone } from "@/components/ui/Icones";
import { getAdmin } from "@/lib/auth";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { getOperationsDashboard } from "@/lib/operations";

function formatAttentionDate(value: Date | null) {
  return value ? formatShortDate(value) : "Sem prazo";
}

/*
 * A tela mostra o rótulo, nunca o valor cru do banco: "IN_PROGRESS" é dado,
 * "Em andamento" é informação. Valor fora da lista aparece como veio, para
 * ninguém sumir com um estado novo.
 */
const rotuloStatusTarefa: Record<string, string> = {
  TODO: "A fazer",
  IN_PROGRESS: "Em andamento",
  BLOCKED: "Bloqueada",
};

const rotuloStatusCliente: Record<string, string> = {
  ACTIVE: "Ativo",
  ONBOARDING: "Onboarding",
  PAUSED: "Pausado",
  ARCHIVED: "Arquivado",
};

export default async function OperationsPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  const data = await getOperationsDashboard();

  const totalAttention =
    data.metrics.overdueTaskCount +
    data.metrics.pendingApprovalCount +
    data.metrics.domainAttentionCount +
    data.metrics.financeAttentionCount;

  /*
   * Cada linha leva a algum lugar. Até 10/09/2026 as seis eram `div` sem
   * destino: o número aparecia e o clique não fazia nada, então a Visão central
   * mostrava o estado da casa sem deixar agir sobre ele.
   *
   * Tarefas e aprovações não têm tela própria: as duas vivem dentro do projeto,
   * e é para lá que apontam. Enquanto não existir tela de tarefa, mandar para
   * /projetos é honesto; inventar rota que não existe seria pior que não linkar.
   */
  const metrics = [
    {
      label: "Clientes ativos",
      value: data.metrics.organizationCount,
      detail: `${data.metrics.onboardingCount} em onboarding`,
      href: "/clientes",
    },
    {
      label: "Projetos abertos",
      value: data.metrics.activeProjectCount,
      detail: "Planejamento, execução ou espera",
      href: "/projetos",
    },
    {
      label: "Tarefas abertas",
      value: data.metrics.openTaskCount,
      detail: `${data.metrics.overdueTaskCount} vencidas`,
      alerta: data.metrics.overdueTaskCount > 0,
      href: "/projetos",
    },
    {
      label: "Aprovações",
      value: data.metrics.pendingApprovalCount,
      detail: "Aguardando decisão",
      href: "/projetos",
    },
    {
      label: "Leads abertos",
      value: data.metrics.openLeadCount,
      detail: "Da entrada à proposta",
      href: "/leads",
    },
    {
      label: "Domínios em 60 dias",
      value: data.metrics.domainAttentionCount,
      detail: "Próximos do vencimento",
      href: "/hub-social/dominios",
    },
  ];

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="operations">
      <header className="page-header operations-header">
        <div>
          <h1>Visão central</h1>
          <p>O que precisa de decisão agora - prazos, domínios e saldo.</p>
        </div>
        <div className="page-actions">
          <Link href="/clientes" className="primary-button">
            Adicionar cliente
          </Link>
          <Link href="/financeiro" className="secondary-button">
            Abrir financeiro
          </Link>
        </div>
      </header>

      <section className="command-strip" aria-label="Estado do sistema">
        <div>
          <span className="status-dot" />
          <strong>Operação disponível</strong>
        </div>
        <span>
          Financeiro{" "}
          <strong className={data.latestBalance ? "positive" : "muted"}>
            {data.latestBalance ? "sincronizado" : "sem captura"}
          </strong>
        </span>
        <span>
          Atenções <strong>{totalAttention}</strong>
        </span>
      </section>

      {/* Lista, não seis cartões: quase todos os números são zero, e cartão
          grande para zero enche a tela sem dizer nada. Uma linha por número
          cabe de uma vez no celular. */}
      <section className="operations-metrics" aria-label="Resumo operacional">
        {metrics.map((metric) => (
          <Link className="operations-metric" href={metric.href} key={metric.label}>
            <span className="operations-metric-label">{metric.label}</span>
            <small className={metric.alerta ? "negative" : ""}>{metric.detail}</small>
            <strong>{metric.value}</strong>
            <Icone nome="chevron" tamanho={16} className="chevron" />
          </Link>
        ))}
      </section>

      <section className="operations-grid">
        <article className="operations-panel priority-panel">
          <div className="operations-panel-heading">
            <h2>Fila de atenção</h2>
            <span className="panel-count">
              {data.priorityTasks.length + data.upcomingDomains.length}
            </span>
          </div>

          {data.priorityTasks.length === 0 &&
          data.upcomingDomains.length === 0 ? (
            <div className="operations-empty">
              <strong>Nada urgente por aqui.</strong>
              <p>A fila mostra tarefas, aprovações e vencimentos reais.</p>
            </div>
          ) : (
            <div className="attention-list">
              {/* A tarefa abre onde ela vive: no projeto quando tem projeto, na
                  ficha do cliente quando é solta. */}
              {data.priorityTasks.map((task) => (
                <Link
                  className="attention-row"
                  href={
                    task.project
                      ? `/projetos/${task.project.id}`
                      : `/clientes/${task.organization.id}`
                  }
                  key={task.id}
                >
                  <span
                    className={`attention-marker marker-${task.priority.toLowerCase()}`}
                  />
                  <div>
                    <strong>{task.title}</strong>
                    <small>
                      {task.organization.name}
                      {task.project ? ` · ${task.project.title}` : ""}
                    </small>
                  </div>
                  <span className="attention-type">
                    {rotuloStatusTarefa[task.status] ?? task.status}
                  </span>
                  <time dateTime={task.dueAt?.toISOString()}>
                    {formatAttentionDate(task.dueAt)}
                  </time>
                </Link>
              ))}
              {data.upcomingDomains.map((domain) => (
                <Link
                  className="attention-row"
                  href={`/clientes/${domain.organization.id}`}
                  key={domain.id}
                >
                  <span className="attention-marker marker-domain" />
                  <div>
                    <strong>{domain.fqdn}</strong>
                    <small>{domain.organization.name}</small>
                  </div>
                  <span className="attention-type">Domínio</span>
                  <time dateTime={domain.expiresAt?.toISOString()}>
                    {formatAttentionDate(domain.expiresAt)}
                  </time>
                </Link>
              ))}
            </div>
          )}
        </article>

        <aside className="operations-panel system-balance-panel">
          <div className="operations-panel-heading">
            <h2>Saldo disponível</h2>
          </div>
          <strong className="system-balance">
            {formatCurrency(data.latestBalance?.availableBalance.toString())}
          </strong>
          <dl>
            <div>
              <dt>Conciliações em atenção</dt>
              <dd>{data.metrics.financeAttentionCount}</dd>
            </div>
            <div>
              <dt>Origem</dt>
              <dd>Efí</dd>
            </div>
          </dl>
          <Link href="/financeiro" className="secondary-button">
            Abrir controle financeiro
          </Link>
        </aside>
      </section>

      <section className="operations-panel organizations-preview">
        <div className="operations-panel-heading">
          <h2>Clientes recentes</h2>
          <Link href="/clientes" className="text-link">
            Ver todos
          </Link>
        </div>

        {data.recentOrganizations.length === 0 ? (
          <div className="operations-empty compact-empty">
            <strong>A carteira ainda está vazia.</strong>
            <p>Cadastre o primeiro cliente para iniciar o onboarding.</p>
            <Link href="/clientes" className="primary-button">
              Cadastrar primeiro cliente
            </Link>
          </div>
        ) : (
          <div className="organization-preview-list">
            {data.recentOrganizations.map((organization) => (
              <Link
                className="organization-preview-row"
                href={`/clientes/${organization.id}`}
                key={organization.id}
              >
                <span>{organization.name.slice(0, 2).toUpperCase()}</span>
                <div>
                  <strong>{organization.name}</strong>
                  <small>{organization.segment ?? "Segmento não definido"}</small>
                </div>
                <span
                  className={`status-pill status-${organization.status.toLowerCase()}`}
                >
                  {rotuloStatusCliente[organization.status] ??
                    organization.status}
                </span>
                <small>
                  {organization._count.projects} projetos ·{" "}
                  {organization._count.domains} domínios
                </small>
                <Icone nome="chevron" tamanho={16} className="chevron" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
