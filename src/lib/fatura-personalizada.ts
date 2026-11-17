import { Prisma } from "@prisma/client"
import { z } from "zod"

import { ehDono } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export class FaturaPersonalizadaErro extends Error {}

const entradaSchema = z.object({
  organizationId: z.string().min(1),
  description: z.string().trim().min(1).max(200),
  amountCents: z.number().int().min(1).max(999_999_999_999),
  competence: z.string().regex(/^20\d{2}-(?:0[1-9]|1[0-2])$/),
  dueDate: z.coerce.date(),
  currency: z.literal("BRL").default("BRL"),
  automaticNfse: z.boolean().default(false),
  fiscalServiceCode: z.string().regex(/^\d{6}$/).nullable().default(null),
  fiscalDescription: z.string().trim().min(1).max(2_000).nullable().default(null),
}).strict()

export type EntradaFaturaPersonalizada = z.input<typeof entradaSchema>

export async function criarFaturaPersonalizada(input: EntradaFaturaPersonalizada, actorId: string) {
  const parsed = entradaSchema.safeParse(input)
  if (!parsed.success) throw new FaturaPersonalizadaErro("Dados da cobrança personalizada inválidos.")
  if (!Number.isFinite(parsed.data.dueDate.getTime())) throw new FaturaPersonalizadaErro("Vencimento inválido.")
  if (parsed.data.automaticNfse && (!parsed.data.fiscalServiceCode || !parsed.data.fiscalDescription)) {
    throw new FaturaPersonalizadaErro("Emissão fiscal exige código e descrição do serviço.")
  }
  return prisma.$transaction(async tx => {
    const [actor, organization] = await Promise.all([
      tx.adminIdentity.findUnique({ where: { id: actorId }, select: { role: true } }),
      tx.organization.findUnique({ where: { id: parsed.data.organizationId }, select: { id: true } }),
    ])
    if (!actor) throw new FaturaPersonalizadaErro("Responsável não encontrado.")
    if (!ehDono(actor.role)) throw new FaturaPersonalizadaErro("Só o dono pode criar cobrança personalizada.")
    if (!organization) throw new FaturaPersonalizadaErro("Cliente não encontrado.")
    const invoice = await tx.subscriptionInvoice.create({
      data: {
        organizationId: organization.id, subscriptionId: null, kind: "CUSTOM", description: parsed.data.description,
        amount: new Prisma.Decimal(parsed.data.amountCents).div(100), competence: parsed.data.competence,
        dueDate: parsed.data.dueDate, currency: parsed.data.currency, automaticNfse: parsed.data.automaticNfse,
        fiscalServiceCode: parsed.data.fiscalServiceCode, fiscalDescription: parsed.data.fiscalDescription,
      },
    })
    await tx.operationsAuditEvent.create({ data: { actorId, organizationId: organization.id, action: "CUSTOM_INVOICE_CREATED", entityType: "SubscriptionInvoice", entityId: invoice.id, metadata: { amountCents: parsed.data.amountCents, competence: parsed.data.competence, automaticNfse: parsed.data.automaticNfse } } })
    return invoice
  })
}
