import { prisma } from "@/lib/prisma";

/** Contexto legado escolhido pela conta, validado contra a participação atual. */
export async function empresaVigente(identityId: string, organizationId: string | null | undefined) {
  if (!organizationId) return null;
  const [row] = await prisma.$queryRaw<{ allowed: boolean }[]>`
    SELECT core.can_access_organization(${identityId},${organizationId}) AS allowed`;
  return row?.allowed ? organizationId : null;
}

export async function participaDaEmpresa(identityId: string, organizationId: string, administrar = false) {
  const [row] = await prisma.$queryRaw<{ allowed: boolean }[]>`
    SELECT core.can_access_organization(${identityId},${organizationId},${administrar}) AS allowed`;
  return row?.allowed === true;
}
