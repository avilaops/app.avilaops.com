import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { monitoringSnapshot } from "@/lib/monitoring";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await getAdmin())) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    return NextResponse.json(await monitoringSnapshot(request.nextUrl.searchParams.get("refresh") === "1"));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha na coleta." }, { status: 500 });
  }
}
