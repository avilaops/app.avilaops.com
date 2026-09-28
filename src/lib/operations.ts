import { prisma } from "@/lib/prisma";

export async function getOperationsDashboard() {
  const now = new Date();
  const inSixtyDays = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  const [
    organizationCount,
    onboardingCount,
    activeProjectCount,
    openTaskCount,
    overdueTaskCount,
    pendingApprovalCount,
    openLeadCount,
    domainAttentionCount,
    recentOrganizations,
    priorityTasks,
    upcomingDomains,
    latestBalance,
    financeAttentionCount,
  ] = await Promise.all([
    prisma.organization.count({
      where: { status: { in: ["ACTIVE", "ONBOARDING"] } },
    }),
    prisma.organization.count({ where: { status: "ONBOARDING" } }),
    prisma.project.count({
      where: { status: { in: ["PLANNING", "ACTIVE", "WAITING"] } },
    }),
    prisma.operationalTask.count({
      where: { status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] } },
    }),
    prisma.operationalTask.count({
      where: {
        status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] },
        dueAt: { lt: now },
      },
    }),
    prisma.approval.count({ where: { status: "PENDING" } }),
    prisma.lead.count({
      where: { stage: { in: ["NEW", "QUALIFIED", "DIAGNOSIS", "PROPOSAL"] } },
    }),
    prisma.domainAsset.count({
      where: {
        status: { in: ["ACTIVE", "RENEWAL_DUE"] },
        expiresAt: { lte: inSixtyDays },
      },
    }),
    prisma.organization.findMany({
      where: { status: { not: "ARCHIVED" } },
      include: {
        _count: {
          select: {
            brands: true,
            projects: true,
            tasks: true,
            domains: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.operationalTask.findMany({
      where: {
        status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] },
        OR: [
          { priority: { in: ["HIGH", "URGENT"] } },
          { dueAt: { lte: inSixtyDays } },
        ],
      },
      // O `id` do cliente e do projeto entra porque a Visão central abre a
      // linha: sem ele a fila mostrava a tarefa e não levava a lugar nenhum.
      include: {
        organization: { select: { id: true, name: true } },
        project: { select: { id: true, title: true } },
      },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
      take: 6,
    }),
    prisma.domainAsset.findMany({
      where: {
        status: { in: ["ACTIVE", "RENEWAL_DUE"] },
        expiresAt: { lte: inSixtyDays },
      },
      include: { organization: { select: { id: true, name: true } } },
      orderBy: { expiresAt: "asc" },
      take: 5,
    }),
    prisma.balanceSnapshot.findFirst({
      where: { accountId: "efi-production" },
      orderBy: { capturedAt: "desc" },
    }),
    prisma.reconciliation.count({
      where: { status: { in: ["PENDING", "REVIEW"] } },
    }),
  ]);

  return {
    metrics: {
      organizationCount,
      onboardingCount,
      activeProjectCount,
      openTaskCount,
      overdueTaskCount,
      pendingApprovalCount,
      openLeadCount,
      domainAttentionCount,
      financeAttentionCount,
    },
    recentOrganizations,
    priorityTasks,
    upcomingDomains,
    latestBalance,
  };
}

