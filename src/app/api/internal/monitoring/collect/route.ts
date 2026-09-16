import { NextRequest, NextResponse } from "next/server";
import { requestIdFrom } from "@/lib/health/request";
import { collectServices } from "@/lib/monitoring";

export const maxDuration = 15;

export async function POST(request: NextRequest) {
  const requestId = requestIdFrom(request.headers);
  const token = process.env.MONITORING_INGEST_TOKEN?.trim();
  if (!token || request.headers.get("authorization") !== `Bearer ${token}`) {
    return NextResponse.json({ error: "Não autorizado.", requestId }, { status: 401 });
  }
  const results = await collectServices(requestId, "timer");
  return NextResponse.json({ ok: true, checked: results.length, requestId }, { headers: { "x-request-id": requestId } });
}
