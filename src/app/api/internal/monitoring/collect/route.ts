import { NextRequest, NextResponse } from "next/server";
import { collectServices } from "@/lib/monitoring";

export const maxDuration = 15;

export async function POST(request: NextRequest) {
  const token = process.env.MONITORING_INGEST_TOKEN?.trim();
  if (!token || request.headers.get("authorization") !== `Bearer ${token}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const results = await collectServices();
  return NextResponse.json({ ok: true, checked: results.length });
}
