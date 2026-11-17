import { NextRequest, NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";

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
