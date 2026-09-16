import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { requestIdFrom } from "@/lib/health/request";
import { serviceDetail } from "@/lib/monitoring";

export const dynamic = "force-dynamic";

/** Últimos checks, falhas seguidas, última falha e recuperação de um serviço. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const requestId = requestIdFrom(request.headers);
  const headers = { "x-request-id": requestId, "cache-control": "no-store" };
  if (!(await getAdmin())) return NextResponse.json({ error: "Não autorizado.", requestId }, { status: 401, headers });
  const { key } = await params;
  const started = Date.now();
  const detail = await serviceDetail(key);
  if (!detail) return NextResponse.json({ error: "Serviço não monitorado.", requestId }, { status: 404, headers });
  return NextResponse.json({ ...detail, requestId, endpoint: `GET /api/monitoring/services/${key}`, durationMs: Date.now() - started }, { headers });
}
