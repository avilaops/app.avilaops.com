import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function csvCell(value: unknown) {
  const normalized = String(value ?? "").replace(/\r?\n/g, " ");
  return `"${normalized.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const url = new URL(request.url);
  const requestedRange = Number.parseInt(url.searchParams.get("range") ?? "30", 10);
  const range = [7, 30, 90, 365].includes(requestedRange) ? requestedRange : 30;
  const status = url.searchParams.get("status");
  const periodStart = new Date(Date.now() - range * 24 * 60 * 60 * 1000);

  const transactions = await prisma.bankTransaction.findMany({
    where: {
      accountId: "efi-production",
      occurredAt: { gte: periodStart },
      ...(status ? { reconciliation: { is: { status } } } : {}),
    },
    include: { reconciliation: true },
    orderBy: { occurredAt: "desc" },
  });

  const rows = [
    [
      "data",
      "direcao",
      "tipo",
      "descricao",
      "contraparte",
      "valor_brl",
      "status_conciliacao",
      "tipo_referencia",
      "referencia",
    ],
    ...transactions.map((item) => [
      item.occurredAt.toISOString(),
      item.direction,
      item.transactionType,
      item.description,
      item.counterpartyName ?? "",
      item.amount.toFixed(2),
      item.reconciliation?.status ?? "PENDING",
      item.reconciliation?.referenceType ?? "",
      item.reconciliation?.referenceId ?? "",
    ]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;

  await prisma.financeAuditEvent.create({
    data: {
      actorId: admin.id,
      action: "REPORT_EXPORTED",
      entityType: "TransactionsCsv",
      metadata: { range, status, rowCount: transactions.length },
    },
  });

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="avila-financeiro-${range}d.csv"`,
      "cache-control": "no-store",
    },
  });
}
