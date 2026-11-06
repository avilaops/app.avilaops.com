/** Somente dados obtidos no servidor via Experiments e VPN. */
export type GithubCiRun = {
  id: number; name: string; sourceSha: string; status: string;
  conclusion: string | null; url: string; event: string; updatedAt: string | null;
};
export type GithubCiProject = {
  repository: string; available: boolean; reason?: string; latestRuns?: GithubCiRun[];
};
export type GithubCiSnapshot =
  | { status: "unconfigured" | "unavailable"; data: null }
  | { status: "ok"; data: { available: boolean; stale?: boolean; collectedAt?: string; projects?: GithubCiProject[] } };

const REPOS = new Set([
  "avilaops/ERP-Next", "avilaops/app.avilaops.com", "avilaops/auth.avilaops.com",
  "avilaops/lojas.avilaops.com", "avilaops/crm.avilaops.com", "avilaops/TMS", "avilaops/cms.avilaops.com",
]);
const STATUSES = new Set(["queued","in_progress","completed","requested","waiting","pending"]);
const CONCLUSIONS = new Set(["success","failure","cancelled","skipped","timed_out","action_required","neutral","stale","startup_failure"]);

function parseEvidence(raw: unknown): GithubCiSnapshot["data"] | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.available !== "boolean") return null;
  if (!obj.available) return { available: false };
  if (typeof obj.collectedAt !== "string" || !Number.isFinite(Date.parse(obj.collectedAt)) ||
      !Array.isArray(obj.projects) || obj.projects.length !== REPOS.size) return null;
  const seen = new Set<string>();
  const projects: GithubCiProject[] = [];
  for (const item of obj.projects) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const p = item as Record<string, unknown>;
    if (typeof p.repository !== "string" || !REPOS.has(p.repository) ||
        seen.has(p.repository) || typeof p.available !== "boolean") return null;
    seen.add(p.repository);
    if (!p.available) {
      projects.push({ repository: p.repository, available: false, reason: typeof p.reason === "string" ? p.reason.slice(0, 80) : "indisponível" });
      continue;
    }
    if (!Array.isArray(p.latestRuns) || p.latestRuns.length > 6) return null;
    const latestRuns: GithubCiRun[] = [];
    for (const item of p.latestRuns) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const run = item as Record<string, unknown>;
      if (!Number.isSafeInteger(run.id) || (run.id as number) <= 0 ||
          typeof run.name !== "string" || run.name.length > 160 ||
          typeof run.sourceSha !== "string" || !/^[0-9a-f]{40}$/.test(run.sourceSha) ||
          typeof run.url !== "string" || !run.url.startsWith("https://github.com/avilaops/") ||
          typeof run.status !== "string" || !STATUSES.has(run.status) ||
          !(run.conclusion === null || typeof run.conclusion === "string" && CONCLUSIONS.has(run.conclusion))) return null;
      latestRuns.push({
        id: run.id as number, name: run.name, sourceSha: run.sourceSha,
        status: run.status, conclusion: run.conclusion as string | null, url: run.url,
        event: typeof run.event === "string" ? run.event.slice(0,40) : "",
        updatedAt: typeof run.updatedAt === "string" ? run.updatedAt : null,
      });
    }
    projects.push({ repository: p.repository, available: true, latestRuns });
  }
  const elapsed = Date.now() - Date.parse(obj.collectedAt);
  return { available: true, stale: obj.stale === true || elapsed > 2*60*60*1000 || elapsed < -60_000,
    collectedAt: obj.collectedAt, projects };
}

export async function fetchGithubCiSnapshot(): Promise<GithubCiSnapshot> {
  const base = process.env.EXPERIMENTS_PRIVATE_API_URL?.trim();
  const token = process.env.EXPERIMENTS_API_TOKEN?.trim();
  if (!base || !token) return { status: "unconfigured", data: null };
  let url: URL;
  try {
    url = new URL("/api/v1/github-ci", base);
    if (url.protocol !== "http:" || url.hostname !== "10.10.0.4" || url.port !== "3300") {
      return { status: "unavailable", data: null };
    }
  } catch { return { status: "unavailable", data: null }; }
  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { status: "unavailable", data: null };
    const raw: unknown = await res.json();
    const data = parseEvidence(raw);
    return data ? { status: "ok", data } : { status: "unavailable", data: null };
  } catch { return { status: "unavailable", data: null }; }
}
