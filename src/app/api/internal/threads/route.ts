import { NextRequest, NextResponse } from "next/server";
import { empresaThreadsDoCrm } from "@/lib/threads-consumidores";
import { estadoThreads, metricasThreads } from "@/lib/threads";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  const organizationId = empresaThreadsDoCrm(request.headers.get("authorization"), request.nextUrl.searchParams.get("tenant"));
  if (!organizationId) return NextResponse.json({ error: "Consumidor ou empresa sem autorização." }, { status: 403, headers });
  const organization = await prisma.organization.findFirst({ where: { id: organizationId, status: { not: "ARCHIVED" } }, select: { id: true } });
  if (!organization) return NextResponse.json({ error: "Empresa indisponível." }, { status: 403, headers });
  try {
    const status = await estadoThreads(organizationId);
    const insights = request.nextUrl.searchParams.get("insights") === "1" ? await metricasThreads(organizationId) : null;
    return NextResponse.json({ ...status, insights }, { headers });
  } catch {
    return NextResponse.json({ error: "Não foi possível consultar o Threads. Confira conexão e permissões." }, { status: 502, headers });
  }
}
