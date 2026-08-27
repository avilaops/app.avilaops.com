import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import JobPostingForm from "@/components/JobPostingForm";
import { getAdmin } from "@/lib/auth";
import { formatDateTime, formatShortDate } from "@/lib/format";
import {
  getJobsSiteStatus,
  isExpired,
  JOB_STATUSES,
  JOBS_SITE_URL,
  listJobAreas,
  listJobPostings,
  STATUS_LABELS,
} from "@/lib/job-postings";

const statusPillClass: Record<string, string> = {
  DRAFT: "status-planning",
  PUBLISHED: "status-active",
  PAUSED: "status-paused",
  CLOSED: "status-archived",
};

export default async function JobPostingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; area?: string; q?: string }>;
}) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const params = await searchParams;
  const status = (JOB_STATUSES as readonly string[]).includes(params.status ?? "")
    ? params.status
    : undefined;
  const area = params.area?.trim() || undefined;
  const q = params.q?.trim() || undefined;

  const [postings, areas, site] = await Promise.all([
    listJobPostings({ status, area, q }),
    listJobAreas(),
    getJobsSiteStatus(),
  ]);

  const noAr = postings.filter((posting) => posting.status === "PUBLISHED").length;
  const vencidas = postings.filter(isExpired).length;
  const candidaturas = postings.reduce(
    (soma, posting) => soma + posting._count.applications,
    0,
  );

  const filterHref = (nextStatus?: string) => {
    const query = new URLSearchParams();
    if (nextStatus) query.set("status", nextStatus);
    if (area) query.set("area", area);
    if (q) query.set("q", q);
    const suffix = query.toString();
    return suffix ? `/vagas?${suffix}` : "/vagas";
  };

  return (
    <AppShell adminName={admin.nome} section="jobs">
      <header className="page-header">
        <div>
          <h1>Vagas</h1>
          <p>
            Cada vaga sai do banco para{" "}
            <a className="text-link" href={JOBS_SITE_URL} target="_blank" rel="noreferrer">
              jobs.avilaops.com
            </a>{" "}
            no build do site — é o conteúdo que alimenta o Google Jobs.
          </p>
        </div>
        <JobPostingForm />
      </header>

      {site.stale ? (
        <section className="jobs-site-banner jobs-site-banner-stale">
          <strong>Site desatualizado.</strong>
          <p>
            Uma vaga no ar mudou em {formatDateTime(site.pendingSince)} e a última
            leitura do build foi {site.lastReadAt ? formatDateTime(site.lastReadAt) : "nunca"}.
            Rode <code>npm run deploy</code> em <code>jobs.avilaops.com/</code> para
            publicar.
          </p>
        </section>
      ) : (
        <section className="jobs-site-banner">
          <strong>Site em dia.</strong>
          <p>
            Última leitura do build: {formatDateTime(site.lastReadAt)}. O carimbo marca
            quando o build leu as vagas, não quando o site subiu.
          </p>
        </section>
      )}

      <section className="client-summary-strip">
        <span>
          No ar <strong>{noAr}</strong>
        </span>
        <span>
          Cadastradas <strong>{postings.length}</strong>
        </span>
        <span>
          Candidaturas <strong>{candidaturas}</strong>
        </span>
        <span>
          Prazo vencido <strong>{vencidas}</strong>
        </span>
      </section>

      <nav className="filter-strip" aria-label="Filtrar por estado">
        <Link
          href={filterHref()}
          className={!status ? "filter-chip filter-chip-active" : "filter-chip"}
        >
          Todas
        </Link>
        {JOB_STATUSES.map((item) => (
          <Link
            href={filterHref(item)}
            key={item}
            className={status === item ? "filter-chip filter-chip-active" : "filter-chip"}
          >
            {STATUS_LABELS[item]}
          </Link>
        ))}
      </nav>

      <form className="jobs-search" action="/vagas" method="get">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <label>
          Buscar
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Título, referência ou resumo"
            maxLength={80}
          />
        </label>
        <label>
          Área
          <select name="area" defaultValue={area ?? ""}>
            <option value="">Todas as áreas</option>
            {areas.map((item) => (
              <option value={item} key={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary-button" type="submit">
          Filtrar
        </button>
      </form>

      <section className="operations-panel clients-panel">
        <div className="operations-panel-heading">
          <div>
            <h2>Vagas cadastradas</h2>
          </div>
          <span className="panel-count">{postings.length}</span>
        </div>

        {postings.length === 0 ? (
          <div className="operations-empty clients-empty">
            <span className="empty-index">00</span>
            <strong>Nenhuma vaga encontrada.</strong>
            <p>
              Use “Nova vaga” para abrir um rascunho. Ele só aparece no site depois
              de publicado e de um novo build.
            </p>
          </div>
        ) : (
          <div className="clients-list">
            {postings.map((posting, index) => (
              <Link className="client-row job-row" href={`/vagas/${posting.id}`} key={posting.id}>
                <span className="client-index">{String(index + 1).padStart(2, "0")}</span>
                <div className="client-identity">
                  <div>
                    <strong>{posting.title}</strong>
                    <small>
                      {posting.ref} · {posting.area} · {posting.locationType} ·{" "}
                      {posting.contract}
                    </small>
                  </div>
                </div>
                <dl className="client-signals job-signals">
                  <div>
                    <dt>Candidaturas</dt>
                    <dd>{posting._count.applications}</dd>
                  </div>
                  <div>
                    <dt>Publicada</dt>
                    <dd>{posting.postedAt ? formatShortDate(posting.postedAt) : "—"}</dd>
                  </div>
                  <div>
                    <dt>Inscrição até</dt>
                    <dd>
                      {posting.validThrough ? formatShortDate(posting.validThrough) : "—"}
                      {isExpired(posting) ? <em className="job-expired"> vencida</em> : null}
                    </dd>
                  </div>
                </dl>
                <span className={`status-pill ${statusPillClass[posting.status] ?? ""}`}>
                  {STATUS_LABELS[posting.status] ?? posting.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
