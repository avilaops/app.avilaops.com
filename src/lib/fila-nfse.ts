import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { emitirNfseNoErp, ErpNfseErro, reconciliarNfseNoErp } from "@/lib/erp-nfse";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;
const MAX_ATTEMPTS = 8;
const CLAIM_MS = 10 * 60 * 1000;

export async function agendarEmissaoNfse(invoiceId: string, db: Db = prisma) {
  return db.nfseDispatch.upsert({ where: { invoiceId }, create: { invoiceId, idempotencyKey: randomUUID(), nextAttemptAt: new Date() }, update: {} });
}

function retryAt(attempts: number, now: Date) {
  return new Date(now.getTime() + Math.min(24 * 60, 5 * 2 ** Math.max(0, attempts - 1)) * 60_000);
}

type Claimed = { id: string; invoiceId: string; idempotencyKey: string; attempts: number; claimToken: string; erpIssuanceId: string | null };

async function claim(now: Date, limit: number): Promise<Claimed[]> {
  const token = randomUUID();
  const stale = new Date(now.getTime() - CLAIM_MS);
  return prisma.$queryRaw<Claimed[]>(Prisma.sql`
    WITH candidates AS (
      SELECT id FROM operations.nfse_dispatches
      WHERE attempts < ${MAX_ATTEMPTS}
        AND ((status IN ('PENDING','FAILED','UNCERTAIN') AND COALESCE(next_attempt_at, created_at) <= ${now})
          OR (status='PROCESSING' AND claimed_at < ${stale}))
      ORDER BY COALESCE(next_attempt_at, created_at), id
      FOR UPDATE SKIP LOCKED LIMIT ${limit}
    )
    UPDATE operations.nfse_dispatches d
    SET status='PROCESSING', attempts=d.attempts+1, claimed_at=${now}, claim_token=${token}::uuid, updated_at=${now}
    FROM candidates WHERE d.id=candidates.id
    RETURNING d.id, d.invoice_id AS "invoiceId", d.idempotency_key::text AS "idempotencyKey", d.attempts, d.claim_token::text AS "claimToken", d.erp_issuance_id AS "erpIssuanceId"
  `);
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 500);

async function processOne(item: Claimed, now: Date) {
  try {
    let result;
    if (item.erpIssuanceId) {
      result = await reconciliarNfseNoErp(item.erpIssuanceId, item.idempotencyKey);
    } else {
      const invoice = await prisma.subscriptionInvoice.findUnique({ where: { id: item.invoiceId }, include: { organization: { include: { contacts: { where: { isPrimary: true }, take: 1 } } } } });
      if (!invoice) throw new ErpNfseErro("Fatura não encontrada.");
      if (invoice.status !== "PAID") throw new ErpNfseErro("A NFS-e exige uma fatura paga.");
      if (!invoice.fiscalServiceCode || !invoice.fiscalDescription) throw new ErpNfseErro("Dados fiscais da fatura incompletos.");
      const taxId = invoice.organization.cpfCnpj?.replace(/\D/g, "") ?? "";
      if (taxId.length !== 11 && taxId.length !== 14) throw new ErpNfseErro("CPF ou CNPJ do cliente não cadastrado.");
      result = await emitirNfseNoErp({ idempotencyKey: item.idempotencyKey, externalId: invoice.id, competenceDate: `${invoice.competence}-01`, amount: invoice.amount.toFixed(2), serviceCode: invoice.fiscalServiceCode, description: invoice.fiscalDescription, customer: { name: invoice.organization.legalName || invoice.organization.name, taxId, email: invoice.organization.contacts[0]?.email ?? undefined } });
    }
    const issued = result.status === "ISSUED";
    await prisma.nfseDispatch.updateMany({ where: { id: item.id, claimToken: item.claimToken }, data: { status: issued ? "ISSUED" : result.status === "CANCELLED" ? "CANCELLED" : "UNCERTAIN", erpIssuanceId: result.id, erpStatus: result.status, accessKey: result.accessKey ?? null, issuedAt: issued ? now : null, nextAttemptAt: issued ? null : retryAt(item.attempts, now), lastError: result.reason ?? null, claimToken: null, claimedAt: null } });
    return issued ? "issued" : "pending";
  } catch (error) {
    const uncertain = error instanceof ErpNfseErro && error.uncertain;
    await prisma.nfseDispatch.updateMany({ where: { id: item.id, claimToken: item.claimToken }, data: { status: uncertain ? "UNCERTAIN" : "FAILED", nextAttemptAt: item.attempts < MAX_ATTEMPTS ? retryAt(item.attempts, now) : null, lastError: errorText(error), claimToken: null, claimedAt: null } });
    return uncertain ? "uncertain" : "failed";
  }
}

export async function processarFilaNfse(now = new Date(), limit = 20) {
  const items = await claim(now, Math.max(1, Math.min(50, Math.trunc(limit))));
  const summary = { claimed: items.length, issued: 0, pending: 0, uncertain: 0, failed: 0 };
  for (const item of items) summary[await processOne(item, now)]++;
  return summary;
}
