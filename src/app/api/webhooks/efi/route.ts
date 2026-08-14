import { NextRequest, NextResponse } from "next/server";
import { markDeliverablePaidAndNotify } from "@/lib/deliverables";
import { getCobrancaChargeStatus } from "@/lib/efi-cobranca";
import { prisma } from "@/lib/prisma";

const PAID_COBRANCA_STATUSES = new Set(["paid", "approved", "settled"]);

async function handlePixNotification(body: Record<string, unknown>) {
  const entries = Array.isArray(body.pix) ? body.pix : [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const txid = (entry as Record<string, unknown>).txid;
    if (typeof txid !== "string") continue;

    const charge = await prisma.deliverableCharge.findFirst({
      where: { method: "PIX", externalId: txid, status: "PENDING" },
    });
    if (!charge) continue;

    await prisma.deliverableCharge.update({
      where: { id: charge.id },
      data: { status: "PAID", paidAt: new Date() },
    });
    await markDeliverablePaidAndNotify(charge.deliverableId);
  }
}

/**
 * O formato exato da notificação de Cobranças (boleto/cartão) do Efí não foi
 * validado em sandbox neste ambiente. Em vez de confiar no payload recebido,
 * usamos a notificação apenas como gatilho para reconsultar o status real de
 * cada cobrança pendente diretamente na API do Efí.
 */
async function reconcilePendingCobrancas() {
  const pending = await prisma.deliverableCharge.findMany({
    where: { method: { in: ["BOLETO", "CARD"] }, status: "PENDING", externalId: { not: null } },
  });

  for (const charge of pending) {
    if (!charge.externalId) continue;
    try {
      const status = await getCobrancaChargeStatus(charge.externalId);
      if (PAID_COBRANCA_STATUSES.has(status.toLowerCase())) {
        await prisma.deliverableCharge.update({
          where: { id: charge.id },
          data: { status: "PAID", paidAt: new Date() },
        });
        await markDeliverablePaidAndNotify(charge.deliverableId);
      }
    } catch (error) {
      console.error(`Falha ao reconciliar cobrança ${charge.externalId}`, error);
    }
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (body && Array.isArray(body.pix)) {
    await handlePixNotification(body);
  } else {
    await reconcilePendingCobrancas();
  }

  return NextResponse.json({ ok: true });
}
