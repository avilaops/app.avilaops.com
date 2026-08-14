import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cleanText, sameOrigin } from "@/lib/http";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  const { id } = await params;

  const existing = await prisma.clientRegistrationRequest.findUnique({
    where: { id },
    select: { id: true, status: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });
  }

  if (existing.status !== "PENDING") {
    return NextResponse.json(
      { error: "Esta solicitação já foi processada." },
      { status: 409 }
    );
  }

  let motivoRejeicao: string | null = null;
  try {
    const body = await request.json();
    motivoRejeicao = cleanText(body?.motivo, 500) || null;
  } catch {
    // motivo é opcional
  }

  await prisma.clientRegistrationRequest.update({
    where: { id },
    data: {
      status: "REJECTED",
      motivoRejeicao,
      revisadoPorId: admin.id,
      revisadoEm: new Date(),
    },
  });

  await prisma.operationsAuditEvent.create({
    data: {
      action: "CLIENT_REGISTRATION_REQUEST_REJECTED",
      entityType: "ClientRegistrationRequest",
      entityId: id,
      actorId: admin.id,
      metadata: { motivo: motivoRejeicao },
    },
  });

  return NextResponse.json({ ok: true });
}
