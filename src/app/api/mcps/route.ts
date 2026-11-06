import { NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Inventário de publicações: consulta de metadados, sem sondagens ou segredos. */
export async function GET() {
  const admin = await getAdmin();
  const headers = { "cache-control": "private, no-store" };
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401, headers });
  if (!ehDono(admin.role)) return NextResponse.json({ error: "Acesso restrito ao OWNER." }, { status: 403, headers });

  try {
    const publicacoes = await prisma.mcpPublication.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, domain: true, endpoint: true,
        enabled: true, description: true, updatedAt: true,
      },
    });
    return NextResponse.json({
      publicacoes,
      total: publicacoes.length,
      note: "enabled é apenas habilitação cadastral; não comprova MCP acessível.",
    }, { headers });
  } catch (error) {
    console.error("[mcp-publications] falha de leitura", error);
    return NextResponse.json({ error: "Inventário indisponível." }, { status: 503, headers });
  }
}
