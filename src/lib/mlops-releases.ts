/** Release readiness fetched server-to-server from Experiments on WireGuard. */
export type ReleaseGate = {
  id: "ci" | "contract" | "security" | "humanApproval" | "deployment" | "postDeployHealth";
  verdict: "passed" | "failed" | "unknown";
  evidence: string | null;
};
export type ReleaseAssessment = {
  repository: string;
  sourceSha: string | null;
  decision: "review" | "rejected" | "approved";
  reason: string;
  gates: ReleaseGate[];
  workflowRuns: { id: number; name: string; status: string; conclusion: string | null; url: string }[];
};
export type ReleaseOverview =
  | { status: "unconfigured" | "unavailable"; items: []; collectedAt: null; stale: true }
  | { status: "ok"; items: ReleaseAssessment[]; collectedAt: string | null; stale: boolean };

const PRIVATE_EXPERIMENTS_HOST = "10.10.0.4";
const gateIds = ["ci", "contract", "security", "humanApproval", "deployment", "postDeployHealth"];

export async function releaseOverview(): Promise<ReleaseOverview> {
  const base = process.env.EXPERIMENTS_PRIVATE_API_URL?.trim();
  const token = process.env.EXPERIMENTS_API_TOKEN?.trim();
  if (!base || !token) return { status: "unconfigured", items: [], collectedAt: null, stale: true };
  let endpoint: URL;
  try {
    const origin = new URL(base);
    if (origin.protocol !== "http:" || origin.hostname !== PRIVATE_EXPERIMENTS_HOST ||
        origin.port !== "3300" || origin.username || origin.password || origin.pathname !== "/" ||
        origin.search || origin.hash) throw new Error("Invalid private origin");
    endpoint = new URL("/api/v1/release-assessments", origin);
  } catch {
    return { status: "unavailable", items: [], collectedAt: null, stale: true };
  }
  try {
    const response = await fetch(endpoint.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) throw new Error("Unavailable");
    const raw: unknown = await response.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid evidence");
    const doc = raw as Record<string, unknown>;
    if (doc.schema !== "avila-release-assessments/1" || !Array.isArray(doc.projects) ||
        doc.projects.length > 30 || typeof doc.stale !== "boolean") throw new Error("Invalid report");
    const items: ReleaseAssessment[] = [];
    for (const source of doc.projects) {
      if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("Invalid item");
      const row = source as Record<string, unknown>;
      if (typeof row.repository !== "string" || !/^avilaops\/[A-Za-z0-9._-]+$/.test(row.repository) ||
          !(row.sourceSha === null || (typeof row.sourceSha === "string" && /^[a-f0-9]{40}$/.test(row.sourceSha))) ||
          !["review", "rejected", "approved"].includes(String(row.decision)) ||
          typeof row.reason !== "string" || !Array.isArray(row.gates) || row.gates.length !== gateIds.length) {
        throw new Error("Invalid item");
      }
      const gates: ReleaseGate[] = [];
      for (let i = 0; i < gateIds.length; i++) {
        const gate = row.gates[i] as Record<string, unknown>;
        if (!gate || gate.id !== gateIds[i] ||
            !["passed", "failed", "unknown"].includes(String(gate.verdict)) ||
            !(gate.evidence === null || (typeof gate.evidence === "string" && gate.evidence.startsWith("https://github.com/avilaops/")))) {
          throw new Error("Invalid gate");
        }
        gates.push({ id: gate.id as ReleaseGate["id"], verdict: gate.verdict as ReleaseGate["verdict"], evidence: gate.evidence as string | null });
      }
      // A confirmação da CI isolada não pode ser interpretada como autorização de deploy.
      if (row.decision === "approved" && gates.some(g => g.verdict !== "passed")) throw new Error("Unproven approval");
      items.push({
        repository: row.repository, sourceSha: row.sourceSha as string | null,
        decision: row.decision as ReleaseAssessment["decision"], reason: row.reason.slice(0, 500),
        gates, workflowRuns: [],
      });
    }
    return { status: "ok", items, collectedAt: typeof doc.sourceCollectedAt === "string" ? doc.sourceCollectedAt : null, stale: doc.stale };
  } catch {
    return { status: "unavailable", items: [], collectedAt: null, stale: true };
  }
}
