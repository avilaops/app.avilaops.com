import { NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { conferirComprovante, notaDoComprovante } from "@/lib/comprovante-pix";
import { prisma } from "@/lib/prisma";

/**
 * Concilia um Pix pelo comprovante que a contraparte mandou.
 *
 * É o caminho para a movimentação que chega sem pagador — o Éfi não devolve
 * esse campo em Pix recebido fora de cobrança. A conciliação normal
 * (`PATCH /api/reconciliations/{id}`) exige uma referência: uma conta a
 * receber que baixe. Quando o dinheiro entrou sem conta lançada antes, não há
 * o que referenciar, e o que sustenta a decisão é o próprio comprovante.
 *
 * Aceitar o comprovante não é acreditar em quem digitou: o identificador
 * ponta a ponta informado tem de ser igual ao que a sincronização gravou. É a
 * conferência que separa "conciliado" de "alguém escreveu um nome aqui".
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  // Dinheiro, segredo e acesso são do dono; a equipe para aqui.
  if (!ehDono(admin.role)) {
    return NextResponse.json({ error: "Só o dono da conta pode isto." }, { status: 403 });
  }

  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Movimentação inválida." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    identificador?: unknown;
    pagador?: unknown;
    documento?: unknown;
  };

  const transactionId = BigInt(id);
  const movimentacao = await prisma.bankTransaction.findUnique({
    where: { id: transactionId },
    select: { id: true, endToEndId: true, direction: true, occurredAt: true },
  });
  if (!movimentacao) {
    return NextResponse.json({ error: "Movimentação não encontrada." }, { status: 404 });
  }

  const conferencia = conferirComprovante(
    {
      identificador: typeof body.identificador === "string" ? body.identificador : "",
      pagador: typeof body.pagador === "string" ? body.pagador : "",
      documento: typeof body.documento === "string" ? body.documento : null,
    },
    movimentacao,
  );
  if (!conferencia.ok) {
    return NextResponse.json({ error: conferencia.erro }, { status: 422 });
  }
  const comprovante = conferencia.comprovante;

  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.bankTransaction.update({
        where: { id: transactionId },
        data: {
          counterpartyName: comprovante.pagador,
          counterpartyDocument: comprovante.documento,
          counterpartySource: "COMPROVANTE",
        },
      });

      await transaction.reconciliation.upsert({
        where: { transactionId },
        update: {
          status: "MATCHED",
          referenceType: "COMPROVANTE",
          referenceId: comprovante.identificador,
          note: notaDoComprovante(comprovante),
          reviewedBy: admin.id,
          matchedAt: new Date(),
          matchSource: "COMPROVANTE",
          confidence: null,
        },
        create: {
          transactionId,
          status: "MATCHED",
          referenceType: "COMPROVANTE",
          referenceId: comprovante.identificador,
          note: notaDoComprovante(comprovante),
          reviewedBy: admin.id,
          matchedAt: new Date(),
          matchSource: "COMPROVANTE",
        },
      });

      await transaction.financeAuditEvent.create({
        data: {
          actorId: admin.id,
          action: "RECONCILIATION_COMPROVANTE",
          entityType: "BankTransaction",
          entityId: id,
          metadata: {
            identificador: comprovante.identificador,
            pagador: comprovante.pagador,
            documento: comprovante.documento,
            tipoDocumento: comprovante.tipoDocumento,
            // Guardado para a auditoria conseguir explicar a diferença de
            // fuso entre o horário do comprovante e o carimbo do Pix.
            instanteDoIdentificador: comprovante.instante?.toISOString() ?? null,
            ocorridoEm: movimentacao.occurredAt.toISOString(),
          },
        },
      });
    });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível gravar a conciliação." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    status: "MATCHED",
    pagador: comprovante.pagador,
    identificador: comprovante.identificador,
  });
}
