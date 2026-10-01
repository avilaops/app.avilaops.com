import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Health público: não expor versão nem detalhes internos.
// GIT_SHA e BUILT_AT continuam disponíveis no ambiente do contêiner via SSH.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "degraded" }, { status: 503 });
  }
}
