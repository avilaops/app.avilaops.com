import { prisma } from "@/lib/prisma";

const OPEN_TASK_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED"];

export type ProjectFilter = {
  status?: string;
  organizationId?: string;
};

export async function getProjects(filter: ProjectFilter = {}) {
  return prisma.project.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.organizationId
        ? { organizationId: filter.organizationId }
        : {}),
    },
    include: {
      organization: { select: { id: true, name: true } },
      brand: { select: { id: true, name: true } },
      _count: {
        select: {
          tasks: { where: { status: { in: OPEN_TASK_STATUSES } } },
          files: true,
        },
      },
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
  });
}

export async function getProjectDetail(id: string) {
  return prisma.project.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true } },
      brand: { select: { id: true, name: true } },
      tasks: {
        orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "asc" }],
      },
      files: { orderBy: { createdAt: "desc" } },
    },
  });
}

export async function getOrganizationsForSelect() {
  return prisma.organization.findMany({
    where: { status: { not: "ARCHIVED" } },
    select: {
      id: true,
      name: true,
      brands: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });
}
