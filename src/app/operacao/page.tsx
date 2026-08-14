import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getAdmin } from "@/lib/auth";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { getOperationsDashboard } from "@/lib/operations";

function formatAttentionDate(value: Date | null) {
  return value ? formatShortDate(value) : "Sem prazo";
}

const modules = [
  {
    name: "Clientes e marcas",
    detail: "Organizações, marcas e contexto operacional",
    state: "ATIVO",
    tone: "active",
    href: "/clientes",
  },
  {
    name: "Entregas",
    detail: "Projetos, tarefas, prazos e evidências",
    state: "ATIVO",
    tone: "active",
    href: "/projetos",
  },
  {
    name: "Conteúdo e campanhas",
    detail: "Pauta, aprovação, publicação e resultado",
    state: "PRÓXIMO",
    tone: "next",
  },
  {
    name: "Leads e oportunidades",
    detail: "Origem, etapa, SLA e próxima ação",
    state: "FUNDAÇÃO",
    tone: "foundation",
  },
  {
    name: "Domínios",
    detail: "Carteira, vencimentos, DNS e renovação",
    state: "ATIVO",
    tone: "active",
    href: "/operacao/dominios",
  },
  {
    name: "Observabilidade OSB",
    detail: "Saúde digital, Uptime, SEO, Core Web Vitals e links",
    state: "ATIVO",
    tone: "active",
    href: "/operacao/obs",
  },
  {
    name: "Financeiro",
    detail: "Conta, conciliação, evidência e relatórios",
    state: "ATIVO",
    tone: "active",
    href: "/financeiro",
  },
];

export default async function OperationsPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  const data = await getOperationsDashboard();

  const totalAttention =
    data.metrics.overdueTaskCount +
    data.metrics.pendingApprovalCount +
    data.metrics.domainAttentionCount +
    data.metrics.financeAttentionCount;

  return (
    <AppShell adminName={admin.nome} section="operations">
      <header className="page-header operations-header">
        <div>
          <span className="eyebrow">Ávila OS · Visão central</span>
          <h1>O que precisa acontecer agora.</h1>
          <p>
            Clientes, entregas, oportunidades, domínios e financeiro em uma
            única leitura operacional — sem esconder o que ainda depende de
            decisão.
          </p>
        </div>
        <div className="page-actions">
          <Link href="/clientes" className="primary-button">
            Adicionar cliente <span aria-hidden="true">+</span>
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
          Banco <strong>PostgreSQL</strong>
        </span>
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

      <section className="operations-metrics" aria-label="Resumo operacional">
        <article className="operations-metric operations-metric-primary">
          <span>Clientes ativos</span>
          <strong>{data.metrics.organizationCount}</strong>
          <small>{data.metrics.onboardingCount} em onboarding</small>
        </article>
        <article className="operations-metric">
          <span>Projetos abertos</span>
          <strong>{data.metrics.activeProjectCount}</strong>
          <small>Planejamento, execução ou espera</small>
        </article>
        <article className="operations-metric">
          <span>Tarefas abertas</span>
          <strong>{data.metrics.openTaskCount}</strong>
          <small className={data.metrics.overdueTaskCount ? "negative" : ""}>
            {data.metrics.overdueTaskCount} vencidas
          </small>
        </article>
        <article className="operations-metric">
          <span>Aprovações</span>
          <strong>{data.metrics.pendingApprovalCount}</strong>
          <small>Aguardando decisão</small>
        </article>
        <article className="operations-metric">
          <span>Leads abertos</span>
          <strong>{data.metrics.openLeadCount}</strong>
          <small>Da entrada à proposta</small>
        </article>
        <article className="operations-metric">
          <span>Domínios · 60 dias</span>
          <strong>{data.metrics.domainAttentionCount}</strong>
          <small>Próximos do vencimento</small>
        </article>
      </section>

      <section className="operations-grid">
        <article className="operations-panel priority-panel">
          <div className="operations-panel-heading">
            <div>
              <span className="eyebrow">Fila de atenção</span>
              <h2>Decisões e prazos</h2>
            </div>
            <span className="panel-count">
              {data.priorityTasks.length + data.upcomingDomains.length}
            </span>
          </div>

          {data.priorityTasks.length === 0 &&
          data.upcomingDomains.length === 0 ? (
            <div className="operations-empty">
              <strong>Nenhuma urgência registrada.</strong>
              <p>
                A fila será preenchida por tarefas, aprovações e vencimentos
                reais — sem dados de demonstração.
              </p>
            </div>
          ) : (
            <div className="attention-list">
              {data.priorityTasks.map((task) => (
                <div className="attention-row" key={task.id}>
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
                  <span className="attention-type">{task.status}</span>
                  <time dateTime={task.dueAt?.toISOString()}>
                    {formatAttentionDate(task.dueAt)}
                  </time>
                </div>
              ))}
              {data.upcomingDomains.map((domain) => (
                <div className="attention-row" key={domain.id}>
                  <span className="attention-marker marker-domain" />
                  <div>
                    <strong>{domain.fqdn}</strong>
                    <small>{domain.organization.name}</small>
                  </div>
                  <span className="attention-type">DOMÍNIO</span>
                  <time dateTime={domain.expiresAt?.toISOString()}>
                    {formatAttentionDate(domain.expiresAt)}
                  </time>
                </div>
              ))}
            </div>
          )}
        </article>

        <aside className="operations-panel system-balance-panel">
          <span className="eyebrow">Sinal financeiro</span>
          <h2>Saldo disponível</h2>
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

      <section className="operations-panel module-panel">
        <div className="operations-panel-heading">
          <div>
            <span className="eyebrow">Arquitetura do produto</span>
            <h2>Módulos da operação</h2>
          </div>
          <small>Ativação progressiva, sem telas vazias disfarçadas</small>
        </div>
        <div className="module-list">
          {modules.map((module, index) => {
            const content = (
              <>
                <span className="module-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <strong>{module.name}</strong>
                  <small>{module.detail}</small>
                </div>
                <span className={`module-state state-${module.tone}`}>
                  {module.state}
                </span>
                <i aria-hidden="true">{module.href ? "↗" : "—"}</i>
              </>
            );

            return module.href ? (
              <Link className="module-row" href={module.href} key={module.name}>
                {content}
              </Link>
            ) : (
              <div className="module-row module-row-disabled" key={module.name}>
                {content}
              </div>
            );
          })}
        </div>
      </section>

      <section className="operations-panel organizations-preview">
        <div className="operations-panel-heading">
          <div>
            <span className="eyebrow">Carteira operacional</span>
            <h2>Clientes recentes</h2>
          </div>
          <Link href="/clientes" className="text-link">
            Ver todos ↗
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
              <div className="organization-preview-row" key={organization.id}>
                <span>{organization.name.slice(0, 2).toUpperCase()}</span>
                <div>
                  <strong>{organization.name}</strong>
                  <small>{organization.segment ?? "Segmento não definido"}</small>
                </div>
                <span className={`status-pill status-${organization.status.toLowerCase()}`}>
                  {organization.status}
                </span>
                <small>
                  {organization._count.projects} projetos ·{" "}
                  {organization._count.domains} domínios
                </small>
              </div>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
