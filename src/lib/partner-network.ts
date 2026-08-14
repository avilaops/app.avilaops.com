import { prisma } from "@/lib/prisma";

const PHASE_LABELS: Record<string, string> = {
  FOUNDATION: "Fundação · dias 1–30",
  IMPLEMENTATION: "Implantação · dias 31–60",
  EVIDENCE: "Evidências · dias 61–90",
};

const CASE_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Não iniciado",
  PILOT: "Em piloto",
  PRODUCTION: "Em produção",
  DOCUMENTED: "Documentado",
};

const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Não iniciado",
  IN_PROGRESS: "Em andamento",
  DONE: "Concluído",
};

const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  POLICY: "Política",
  OPERATIONS: "Operacional",
  RISK: "Risco",
  CASE_STUDY: "Estudo de caso",
};

type Metric = { label: string; value: string };

function computePillarScore(
  pillarId: string,
  roadmap: { phase: string; done: boolean }[],
  cases: { status: string }[],
  documents: { category: string; status: string }[],
): number {
  const doneRatio = (items: { done: boolean }[]) =>
    items.length === 0 ? 0 : items.filter((item) => item.done).length / items.length;

  if (pillarId === "technical") {
    const foundation = roadmap.filter((item) => item.phase === "FOUNDATION");
    return Math.round(doneRatio(foundation) * 100);
  }

  if (pillarId === "clients") {
    const weight: Record<string, number> = {
      NOT_STARTED: 0,
      PILOT: 0.5,
      PRODUCTION: 1,
      DOCUMENTED: 1,
    };
    const total = cases.reduce((sum, item) => sum + (weight[item.status] ?? 0), 0);
    return cases.length === 0 ? 0 : Math.round((total / cases.length) * 100);
  }

  if (pillarId === "governance") {
    const relevant = documents.filter(
      (doc) => doc.category === "POLICY" || doc.category === "RISK",
    );
    const done = relevant.filter((doc) => doc.status === "DONE").length;
    return relevant.length === 0 ? 0 : Math.round((done / relevant.length) * 100);
  }

  if (pillarId === "commercial") {
    const implementation = roadmap.filter((item) => item.phase === "EVIDENCE");
    const commercialSignals = implementation.filter((item) => item.done);
    return implementation.length === 0
      ? 0
      : Math.round((commercialSignals.length / implementation.length) * 100);
  }

  if (pillarId === "delivery") {
    const implementation = roadmap.filter((item) => item.phase === "IMPLEMENTATION");
    const opsDocuments = documents.filter((doc) => doc.category === "OPERATIONS");
    const opsDone = opsDocuments.filter((doc) => doc.status === "DONE").length;
    const roadmapScore = doneRatio(implementation);
    const opsScore = opsDocuments.length === 0 ? 0 : opsDone / opsDocuments.length;
    return Math.round(((roadmapScore + opsScore) / 2) * 100);
  }

  return 0;
}

export async function getPartnerNetworkOverview() {
  const [pillars, roadmapItems, cases, documents] = await Promise.all([
    prisma.partnerPillar.findMany({ orderBy: { weight: "desc" } }),
    prisma.partnerRoadmapItem.findMany({ orderBy: [{ phase: "asc" }, { sortOrder: "asc" }] }),
    prisma.partnerCase.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.partnerDocument.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }] }),
  ]);

  const scoredPillars = pillars.map((pillar) => ({
    ...pillar,
    score: computePillarScore(pillar.id, roadmapItems, cases, documents),
  }));

  const totalScore = scoredPillars.reduce(
    (sum, pillar) => sum + (pillar.score * pillar.weight) / 100,
    0,
  );

  const phases = (["FOUNDATION", "IMPLEMENTATION", "EVIDENCE"] as const).map((phase) => {
    const items = roadmapItems.filter((item) => item.phase === phase);
    const done = items.filter((item) => item.done).length;
    return {
      phase,
      label: PHASE_LABELS[phase],
      items,
      done,
      total: items.length,
    };
  });

  const roadmapDone = roadmapItems.filter((item) => item.done).length;

  const casesWithLabels = cases.map((item) => ({
    ...item,
    statusLabel: CASE_STATUS_LABELS[item.status] ?? item.status,
    metrics: (item.metrics as unknown as Metric[]) ?? [],
  }));

  const documentsWithLabels = documents.map((doc) => ({
    ...doc,
    statusLabel: DOCUMENT_STATUS_LABELS[doc.status] ?? doc.status,
    categoryLabel: DOCUMENT_CATEGORY_LABELS[doc.category] ?? doc.category,
  }));

  const documentsDone = documents.filter((doc) => doc.status === "DONE").length;

  return {
    pillars: scoredPillars,
    totalScore: Math.round(totalScore),
    phases,
    roadmapDone,
    roadmapTotal: roadmapItems.length,
    cases: casesWithLabels,
    documents: documentsWithLabels,
    documentsDone,
    documentsTotal: documents.length,
  };
}

export const partnerCaseStatusLabels = CASE_STATUS_LABELS;
export const partnerDocumentStatusLabels = DOCUMENT_STATUS_LABELS;
export const partnerDocumentCategoryLabels = DOCUMENT_CATEGORY_LABELS;
