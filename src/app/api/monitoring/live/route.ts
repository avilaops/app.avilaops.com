import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { requestIdFrom } from "@/lib/health/request";
import { logHealth, monitoringSnapshot } from "@/lib/monitoring";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestId = requestIdFrom(request.headers);
  const headers = { "x-request-id": requestId, "cache-control": "no-store" };
  if (!(await getAdmin())) return NextResponse.json({ error: "Não autorizado.", requestId }, { status: 401, headers });
  const refresh = request.nextUrl.searchParams.get("refresh") === "1";
  const started = Date.now();
  try {
    const snapshot = await monitoringSnapshot({
      requestId,
      refresh,
      endpoint: `GET /api/monitoring/live${refresh ? "?refresh=1" : ""}`,
    });
    logHealth("live", { requestId, refresh, mode: snapshot.meta.collection.mode, durationMs: Date.now() - started });
    return NextResponse.json(snapshot, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na coleta.";
    logHealth("live_error", { requestId, refresh, message, durationMs: Date.now() - started });
    return NextResponse.json({ error: message, requestId }, { status: 500, headers });
  }
}
