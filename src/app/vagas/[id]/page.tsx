import { notFound, redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CabecalhoTela from "@/components/sistema/CabecalhoTela";
import JobPostingEditor from "@/components/JobPostingEditor";
import { getAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import {
  getJobPostingDetail,
  isExpired,
  JOBS_SITE_URL,
  publishBlockers,
  STAGE_LABELS,
  STATUS_LABELS,
  toBusinessDay,
  type JobPostingContent,
} from "@/lib/job-postings";

const statusPillClass: Record<string, string> = {
  DRAFT: "status-planning",
  PUBLISHED: "status-active",
  PAUSED: "status-paused",
  CLOSED: "status-archived",
};

export default async function JobPostingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const { id } = await params;
  const posting = await getJobPostingDetail(id);
  if (!posting) notFound();

  const blockers = publishBlockers(posting);
  const estagios = Object.entries(posting.stageCounts);

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="jobs">
      <CabecalhoTela
        titulo={posting.title}
        descricao={[
          posting.ref,
          posting.area,
          posting.locationType,
          posting.contract,
          posting.publishedAt ? `no ar desde ${formatDateTime(posting.publishedAt)}` : "nunca publicada",
          isExpired(posting) ? "prazo de inscrição vencido" : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        voltar={{ href: "/vagas", rotulo: "Voltar para Vagas" }}
        icone="vagas"
        acoes={
          <span className={`status-pill ${statusPillClass[posting.status] ?? ""}`}>
            {STATUS_LABELS[posting.status] ?? posting.status}
          </span>
        }
      />

      {estagios.length > 0 ? (
        <section className="client-summary-strip">
          {estagios.map(([stage, total]) => (
            <span key={stage}>
              {STAGE_LABELS[stage] ?? stage} <strong>{total}</strong>
            </span>
          ))}
        </section>
      ) : null}

      <JobPostingEditor
        publicUrl={`${JOBS_SITE_URL}/vagas/${posting.slug}/`}
        blockers={blockers}
        posting={{
          id: posting.id,
          ref: posting.ref,
          slug: posting.slug,
          title: posting.title,
          area: posting.area,
          team: posting.team,
          location: posting.location,
          locationType: posting.locationType,
          contract: posting.contract,
          summary: posting.summary,
          status: posting.status,
          postedAt: toBusinessDay(posting.postedAt),
          validThrough: toBusinessDay(posting.validThrough),
          publishedAt: posting.publishedAt ? posting.publishedAt.toISOString() : null,
          applicationCount: posting._count.applications,
          content: (posting.content ?? {}) as JobPostingContent,
        }}
      />
    </AppShell>
  );
}
