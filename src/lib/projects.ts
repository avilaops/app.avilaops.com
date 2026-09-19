import { prisma } from "@/lib/prisma";

const OPEN_TASK_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED"];

/**
 * Link de projeto só vale http(s).
 *
 * Não é preciosismo de formato: o valor vira `href` na tela do projeto, e um
 * `javascript:` colado aqui viraria script executando no clique de quem abrir.
 * Vive em um lugar só porque criação e edição precisam da mesma regra — duas
 * cópias dariam certo até alguém endurecer uma e esquecer a outra.
 */
export function urlDeProjetoValida(url: string): boolean {
  if (!url) return true;
  try {
    const esquema = new URL(url).protocol;
    return esquema === "http:" || esquema === "https:";
  } catch {
    return false;
  }
}

export const ERRO_URL_DE_PROJETO = "Informe uma URL começando com http:// ou https://.";

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
