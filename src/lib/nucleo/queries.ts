import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

/** identityId deve vir da sessão validada no servidor, nunca do corpo/URL. */
async function autorizar(identityId: string, organizationId: string, financeiro = false) {
  const [row] = await prisma.$queryRaw<{ allowed: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM public.portal_clients p WHERE p.id=${identityId} AND p.ativo
      AND (p.role='OWNER' OR (p.role='SOCIO' AND NOT ${financeiro})
        OR core.can_access_organization(p.id,${organizationId},${financeiro}))
    ) AS allowed`;
  if (!row?.allowed) throw new Error("Sem acesso ao núcleo desta empresa.");
}

export async function listarEmpresasDaIdentidade(identityId: string) {
  return prisma.$queryRaw<{ id: string; name: string; role: string }[]>`
    SELECT o.id,o.name,CASE WHEN p.role IN ('OWNER','SOCIO') THEN p.role ELSE m.role END AS role
    FROM public.portal_clients p CROSS JOIN operations.organizations o
    LEFT JOIN core.effective_memberships m ON m.identity_id=p.id AND m.organization_id=o.id
    WHERE p.id=${identityId} AND p.ativo AND o.status<>'ARCHIVED'
      AND (p.role IN ('OWNER','SOCIO') OR m.id IS NOT NULL) ORDER BY o.name,o.id`;
}

export async function carregarNucleoDaEmpresa(identityId: string, organizationId: string) {
  await autorizar(identityId, organizationId);
  const [produtos, conexoes, ativos, participacoes] = await Promise.all([
    prisma.coreProduct.findMany({ where: { organizationId }, orderBy: [{ productKey: "asc" }, { id: "asc" }] }),
    prisma.$queryRaw<{ id: string; provider: string; health: string; resource: string | null; last_success_at: Date | null }[]>`SELECT id,provider,health,resource,last_success_at FROM core.connection_health WHERE organization_id=${organizationId} ORDER BY provider,id,resource`,
    prisma.coreAssetGrant.findMany({ where: { organizationId }, include: { asset: true }, orderBy: { id: "asc" } }),
    prisma.$queryRaw<{ id: string; identity_id: string; role: string; source: string }[]>`SELECT id,identity_id,role,source FROM core.effective_memberships WHERE organization_id=${organizationId} ORDER BY identity_id`,
  ]);
  return { produtos, conexoes, ativos, participacoes };
}

export async function carregarFinanceiroDaEmpresa(identityId: string, organizationId: string) {
  await autorizar(identityId, organizationId, true);
  const [totais, assinaturas, divergencias] = await Promise.all([
    prisma.$queryRaw`SELECT * FROM core.receivable_totals WHERE organization_id=${organizationId} ORDER BY currency`,
    prisma.$queryRaw`SELECT * FROM core.subscription_totals WHERE organization_id=${organizationId} ORDER BY currency,billing_cycle`,
    prisma.$queryRaw`SELECT * FROM core.contract_drift WHERE organization_id=${organizationId} AND differs`,
  ]);
  return { totais, assinaturas, divergencias };
}

export async function listarRecebiveis(identityId: string, organizationId: string, page = 1, pageSize = 50) {
  await autorizar(identityId, organizationId, true);
  const size = Math.min(100, Math.max(1, Math.trunc(pageSize) || 50));
  const offset = (Math.max(1, Math.trunc(page) || 1) - 1) * size;
  return prisma.$queryRaw`SELECT * FROM core.receivables WHERE organization_id=${organizationId}
    ORDER BY due_date,source,source_id LIMIT ${size} OFFSET ${offset}`;
}

export async function listarPendenciasDoNucleo(identityId: string) {
  const identity = await prisma.adminIdentity.findFirst({ where: { id: identityId, ativo: true, role: "OWNER" }, select: { id: true } });
  if (!identity) throw new Error("Só o dono pode conferir pendências globais do núcleo.");
  return prisma.$queryRaw`SELECT * FROM core.unresolved_links ORDER BY entity_type,entity_id,code`;
}

/** Outbox deve ser gravada na MESMA transação da alteração de negócio. */
export async function agendarEvento(
  tx: Prisma.TransactionClient,
  topic: string,
  deduplicationKey: string,
  payload: Prisma.InputJsonValue,
) {
  return tx.coreOutboxEvent.upsert({
    where: { deduplicationKey }, update: {},
    create: { id: randomUUID(), topic, deduplicationKey, payload },
  });
}

/** Serviço interno: somente após autenticar e validar assinatura do provedor. */
export async function receberEvento(params: {
  provider: string; providerAccount: string; externalId: string; eventType: string; payload: Prisma.InputJsonValue;
}) {
  return prisma.coreInboxEvent.upsert({
    where: { provider_providerAccount_externalId: {
      provider: params.provider, providerAccount: params.providerAccount, externalId: params.externalId,
    } },
    update: {}, create: { id: randomUUID(), ...params },
  });
}

// As quatro funções abaixo são internas aos workers, não endpoints de usuário.
export type EventoReservado = { id: string; payload: Prisma.JsonValue; lease_token: string; locked_until: Date; attempts: number };
export function reservarEntradas(worker: string, quantidade = 10, leaseSeconds = 60) {
  return prisma.$queryRaw<EventoReservado[]>`SELECT * FROM core.claim_inbox(${worker},${quantidade}::integer,${leaseSeconds}::integer)`;
}
export function reservarSaidas(worker: string, quantidade = 10, leaseSeconds = 60) {
  return prisma.$queryRaw<EventoReservado[]>`SELECT * FROM core.claim_outbox(${worker},${quantidade}::integer,${leaseSeconds}::integer)`;
}
export async function concluirEntrada(id: string, leaseToken: string, sucesso: boolean, codigoErro: string | null = null) {
  const [r] = await prisma.$queryRaw<{ done: boolean }[]>`SELECT core.finish_inbox(${id},${leaseToken},${sucesso},${codigoErro}) AS done`;
  return r.done;
}
export async function concluirSaida(id: string, leaseToken: string, sucesso: boolean, codigoErro: string | null = null) {
  const [r] = await prisma.$queryRaw<{ done: boolean }[]>`SELECT core.finish_outbox(${id},${leaseToken},${sucesso},${codigoErro}) AS done`;
  return r.done;
}
