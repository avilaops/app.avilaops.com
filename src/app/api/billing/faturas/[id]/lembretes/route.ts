import { NextRequest, NextResponse } from "next/server";

import { ehDono, getAdmin } from "@/lib/auth";
import { cleanText, sameOrigin } from "@/lib/http";
import { criarLembreteIndividual, ReguaIndividualErro } from "@/lib/regua-cobranca-individual";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
  if (!ehDono(admin.role)) return NextResponse.json({ error: "Só o dono pode criar lembretes." }, { status: 403 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  try {
    const dispatch = await criarLembreteIndividual({ invoiceId: id, scheduledFor: new Date(cleanText(body?.scheduledFor, 40)), content: cleanText(body?.content, 20), actorId: admin.id });
    return NextResponse.json({ dispatch }, { status: 201 });
  } catch (error) {
    if (error instanceof ReguaIndividualErro) return NextResponse.json({ error: error.message }, { status: 422 });
    throw error;
  }
}
