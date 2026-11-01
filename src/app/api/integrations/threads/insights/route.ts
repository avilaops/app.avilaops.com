import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { metricasThreads } from "@/lib/threads";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  if (!(await getAdmin())) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401, headers });
  const organizationId = request.nextUrl.searchParams.get("organizationId");
  if (!organizationId || organizationId.length > 100) return NextResponse.json({ error: "Selecione a empresa." }, { status: 400, headers });
  try { return NextResponse.json(await metricasThreads(organizationId), { headers }); }
  catch { return NextResponse.json({ error: "Métricas indisponíveis. Confira conexão e permissão de métricas do Threads." }, { status: 422, headers }); }
}
