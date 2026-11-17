import { NextRequest, NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { alterarLembreteIndividual, ReguaIndividualErro } from "@/lib/regua-cobranca-individual";
import { cleanText } from "@/lib/http";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; dispatchId: string }> }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
  if (!ehDono(admin.role)) return NextResponse.json({ error: "Só o dono pode alterar lembretes." }, { status: 403 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  const { id, dispatchId } = await params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  try {
    const dispatch = await alterarLembreteIndividual({ invoiceId: id, dispatchId, scheduledFor: body?.scheduledFor ? new Date(cleanText(body.scheduledFor, 40)) : undefined, content: body?.content ? cleanText(body.content, 20) : undefined, restore: body?.restore === true, actorId: admin.id });
    return NextResponse.json({ dispatch });
  } catch (error) {
    if (error instanceof ReguaIndividualErro) return NextResponse.json({ error: error.message }, { status: 422 });
    throw error;
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dispatchId: string }> },
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
  if (!ehDono(admin.role)) return NextResponse.json({ error: "Só o dono pode cancelar lembretes." }, { status: 403 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  const { id, dispatchId } = await params;
  const resultado = await prisma.billingEmailDispatch.updateMany({
    where: { id: dispatchId, invoiceId: id, status: "PENDING" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  if (resultado.count === 0) {
    return NextResponse.json({ error: "Lembrete pendente não encontrado." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
