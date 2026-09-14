import { redirect } from "next/navigation";
import AiCoreValidateButton from "@/components/AiCoreValidateButton";
import ApprovalCard from "@/components/ApprovalCard";
import AppShell from "@/components/AppShell";
import PartnerCaseCard from "@/components/PartnerCaseCard";
import PartnerDocumentRow from "@/components/PartnerDocumentRow";
import RoadmapItemToggle from "@/components/RoadmapItemToggle";
import { getAdmin } from "@/lib/auth";
import { getAiCoreStatus } from "@/lib/ai-core/status";
import { listApprovalsForOrganization } from "@/lib/ai-core/approvals";
import { getPartnerNetworkOverview } from "@/lib/partner-network";
import { formatDateTime } from "@/lib/format";

const INTERNAL_ORGANIZATION_ID = "avila-ops-internal";

export default async function ImplantacaoPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const [data, aiCoreStatus, approvals] = await Promise.all([
    getPartnerNetworkOverview(),
    getAiCoreStatus(),
    listApprovalsForOrganization(INTERNAL_ORGANIZATION_ID),
  ]);
  const pendingApprovals = approvals.filter((item) => item.status === "PENDING" && !item.isExpired);
  const decidedApprovals = approvals.filter(
    (item) => item.status !== "PENDING" || item.isExpired,
  );

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="partner-network">
      <header className="page-header">
        <div>
          <h1>Implantação OpenAI</h1>
          <p>Pilares, roadmap de 90 dias, casos-piloto e documentos do dossiê.</p>
        </div>
      </header>

      <section className="connection-strip" aria-label="Pontuação geral">
        <div>
          <span className="status-dot" />
          <strong>Matriz interna de prontidão</strong>
          <span className="environment-tag">META: 80 PTS</span>
        </div>
        <span>
          Roadmap: <strong>{data.roadmapDone}/{data.roadmapTotal} concluídos</strong>
        </span>
        <span>
          Documentos: <strong>{data.documentsDone}/{data.documentsTotal} prontos</strong>
        </span>
      </section>

      <section className="metric-grid" aria-label="Pontuação por pilar">
        <article className="metric metric-primary">
          <span>Pontuação total</span>
          <strong>{data.totalScore} / 100</strong>
          <small>Preenchida automaticamente a partir das evidências abaixo</small>
        </article>
        {data.pillars.slice(0, 3).map((pillar) => (
          <article className="metric" key={pillar.id}>
            <span>{pillar.label}</span>
            <strong>{pillar.score}%</strong>
            <div className="progress-track" aria-hidden="true">
              <span style={{ width: `${pillar.score}%` }} />
            </div>
          </article>
        ))}
      </section>

      <section className="analysis-grid">
        <article className="section-panel chart-panel">
          <div className="section-heading">
            <div>
              <h2>Peso e evidência acumulada</h2>
            </div>
          </div>
          <div className="pillar-score-list">
            {data.pillars.map((pillar) => (
              <div className="pillar-score-row" key={pillar.id}>
                <div className="pillar-score-label">
                  <strong>{pillar.label}</strong>
                  <small>{pillar.description}</small>
                </div>
                <div className="progress-track" aria-hidden="true">
                  <span style={{ width: `${pillar.score}%` }} />
                </div>
                <span className="pillar-score-value">
                  {pillar.score}%<small> · peso {pillar.weight}</small>
                </span>
              </div>
            ))}
          </div>
        </article>

        <aside className="section-panel health-panel">
          <h2>Como a pontuação é calculada</h2>
          <p style={{ fontSize: "0.82rem", color: "var(--muted)", lineHeight: 1.6 }}>
            Um pilar só pontua quando existe evidência real: item de roadmap marcado,
            documento concluído ou caso em produção - nunca por intenção.
          </p>
          <dl className="health-list">
            <div>
              <dt>Fundação concluída</dt>
              <dd>{data.phases[0].done}/{data.phases[0].total}</dd>
            </div>
            <div>
              <dt>Implantação concluída</dt>
              <dd>{data.phases[1].done}/{data.phases[1].total}</dd>
            </div>
            <div>
              <dt>Evidências concluídas</dt>
              <dd>{data.phases[2].done}/{data.phases[2].total}</dd>
            </div>
          </dl>
        </aside>
      </section>

      <section className="section-panel transactions-panel">
        <div className="section-heading table-heading">
          <div>
            <h2>90 dias, fase por fase</h2>
          </div>
        </div>
        <div className="roadmap-phases">
          {data.phases.map((phase) => (
            <div className="roadmap-phase" key={phase.phase}>
              <div className="roadmap-phase-head">
                <strong>{phase.label}</strong>
                <span>{phase.done}/{phase.total}</span>
              </div>
              <ul className="roadmap-list">
                {phase.items.map((item) => (
                  <RoadmapItemToggle
                    key={item.id}
                    id={item.id}
                    label={item.label}
                    owner={item.owner}
                    done={item.done}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="section-panel transactions-panel">
        <div className="section-heading table-heading">
          <div>
            <h2>Documentos e validação</h2>
          </div>
          <AiCoreValidateButton />
        </div>
        <div className="doc-list">
          <div className="doc-row">
            <div className="doc-row-main">
              <span className="status-pill status-done">Concluído</span>
              <div>
                <strong>Pacote @avila-ops/ai-core implementado</strong>
                <small>Cliente seguro, structured outputs, ferramentas, aprovação humana, avaliações, segurança</small>
              </div>
            </div>
          </div>
          <div className="doc-row">
            <div className="doc-row-main">
              <span className="status-pill status-done">Concluído</span>
              <div>
                <strong>29/29 testes unitários aprovados</strong>
                <small>Sem dependência de rede ou credencial real</small>
              </div>
            </div>
          </div>
          <div className="doc-row">
            <div className="doc-row-main">
              <span className="status-pill status-done">Concluído</span>
              <div>
                <strong>Persistência Prisma implementada e testada</strong>
                <small>
                  Schema ai_core (telemetria, aprovações, política de gasto, avaliações) - 11/11 testes
                  de integração aprovados: isolamento entre tenants, idempotência, concorrência de
                  orçamento e expiração de aprovação
                </small>
              </div>
            </div>
          </div>
          <div className="doc-row">
            <div className="doc-row-main">
              <span className="status-pill status-done">Concluído</span>
              <div>
                <strong>Kill switch disponível</strong>
                <small>Bloqueia por agente ou projeto antes de qualquer chamada à OpenAI</small>
              </div>
            </div>
          </div>
          <div className="doc-row">
            <div className="doc-row-main">
              <span className={`status-pill ${aiCoreStatus.credentialConfigured ? "status-done" : "status-pending"}`}>
                {aiCoreStatus.credentialConfigured ? "Configurada" : "Não configurada"}
              </span>
              <div>
                <strong>Credencial OpenAI (organização interna)</strong>
                <small>Necessária para a primeira chamada real de validação</small>
              </div>
            </div>
          </div>
          <div className="doc-row">
            <div className="doc-row-main">
              <span
                className={`status-pill ${
                  aiCoreStatus.lastValidation?.outcome === "SUCCESS" ? "status-done" : "status-pending"
                }`}
              >
                {aiCoreStatus.lastValidation ? aiCoreStatus.lastValidation.outcome : "Pendente"}
              </span>
              <div>
                <strong>Última chamada real de validação</strong>
                <small>
                  {aiCoreStatus.lastValidation
                    ? `${formatDateTime(aiCoreStatus.lastValidation.createdAt)} · ${aiCoreStatus.lastValidation.latencyMs}ms`
                    : "Nenhuma chamada real realizada ainda"}
                </small>
              </div>
            </div>
          </div>
          <div className="doc-row">
            <div className="doc-row-main">
              <span className="status-pill status-pending">Pendente</span>
              <div>
                <strong>Integração comercial (Caso 01 - Assistente comercial)</strong>
                <small>Próximo passo após a validação real, conforme recomendado</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-panel transactions-panel">
        <div className="section-heading table-heading">
          <div>
            <h2>Aprovações humanas pendentes</h2>
            <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: 4 }}>
              Toda ferramenta sensível chamada por um agente passa por aqui antes de executar.
              Rejeitar exige justificativa; decisões são definitivas e auditadas.
            </p>
          </div>
          <span className="environment-tag">{pendingApprovals.length} PENDENTES</span>
        </div>
        {pendingApprovals.length > 0 ? (
          <div className="case-grid">
            {pendingApprovals.map((item) => (
              <ApprovalCard
                key={item.id}
                id={item.id}
                projectId={item.projectId}
                agentId={item.agentId}
                toolName={item.toolName}
                summary={item.summary}
                payloadPreview={item.payloadPreview}
                status={item.status}
                decidedBy={item.decidedBy}
                decidedAt={item.decidedAt}
                rejectionReason={item.rejectionReason}
                expiresAt={item.expiresAt}
                isExpired={item.isExpired}
                createdAt={item.createdAt}
              />
            ))}
          </div>
        ) : (
          <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
            Nenhuma aprovação pendente no momento.
          </p>
        )}

        {decidedApprovals.length > 0 ? (
          <details style={{ marginTop: 20 }}>
            <summary style={{ cursor: "pointer", fontSize: "0.85rem", color: "var(--muted)" }}>
              Histórico auditável ({decidedApprovals.length})
            </summary>
            <div className="case-grid" style={{ marginTop: 12 }}>
              {decidedApprovals.map((item) => (
                <ApprovalCard
                  key={item.id}
                  id={item.id}
                  projectId={item.projectId}
                  agentId={item.agentId}
                  toolName={item.toolName}
                  summary={item.summary}
                  payloadPreview={item.payloadPreview}
                  status={item.status}
                  decidedBy={item.decidedBy}
                  decidedAt={item.decidedAt}
                  rejectionReason={item.rejectionReason}
                  expiresAt={item.expiresAt}
                  isExpired={item.isExpired}
                  createdAt={item.createdAt}
                />
              ))}
            </div>
          </details>
        ) : null}
      </section>

      <section className="section-panel transactions-panel">
        <div className="section-heading table-heading">
          <div>
            <h2>Evidências de cliente</h2>
          </div>
        </div>
        <div className="case-grid">
          {data.cases.map((item) => (
            <PartnerCaseCard
              key={item.id}
              id={item.id}
              title={item.title}
              competency={item.competency}
              status={item.status}
              statusLabel={item.statusLabel}
              summary={item.summary}
              metrics={item.metrics}
            />
          ))}
        </div>
      </section>

      <section className="section-panel transactions-panel">
        <div className="section-heading table-heading">
          <div>
            <h2>Documentos do dossiê</h2>
          </div>
        </div>
        <div className="doc-list">
          {data.documents.map((doc) => (
            <PartnerDocumentRow
              key={doc.id}
              id={doc.id}
              title={doc.title}
              categoryLabel={doc.categoryLabel}
              status={doc.status}
              statusLabel={doc.statusLabel}
              linkUrl={doc.linkUrl}
              note={doc.note}
            />
          ))}
        </div>
      </section>
    </AppShell>
  );
}
