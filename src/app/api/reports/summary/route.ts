import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { getFinanceDashboard } from "@/lib/dashboard";
import { prisma } from "@/lib/prisma";

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const url = new URL(request.url);
  const requestedRange = Number.parseInt(url.searchParams.get("range") ?? "30", 10);
  const range = [7, 30, 90, 365].includes(requestedRange) ? requestedRange : 30;
  const data = await getFinanceDashboard(range, "ALL");

  const rows = [
    ["indicador", "valor", "unidade"],
    ["Saldo disponível", data.latestBalance?.availableBalance.toFixed(2) ?? "0.00", "BRL"],
    ["Entradas", data.metrics.credits.toFixed(2), "BRL"],
    ["Saídas", data.metrics.debits.toFixed(2), "BRL"],
    ["Fluxo líquido", data.metrics.net.toFixed(2), "BRL"],
    ["Taxa de conciliação", data.metrics.reconciliationRate.toFixed(2), "%"],
    ["Pendências", String(data.metrics.attentionCount), "movimentações"],
    ["Movimentações", String(data.metrics.transactionCount), "movimentações"],
    ["Última sincronização", data.account?.lastSyncAt?.toISOString() ?? "", "ISO-8601"],
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;

  await prisma.financeAuditEvent.create({
    data: {
      actorId: admin.id,
      action: "REPORT_EXPORTED",
      entityType: "ExecutiveSummaryCsv",
      metadata: { range },
    },
  });

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="avila-resumo-financeiro-${range}d.csv"`,
      "cache-control": "no-store",
    },
  });
}
