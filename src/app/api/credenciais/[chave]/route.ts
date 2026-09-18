import { NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { removerCredencial } from "@/lib/credenciais";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ chave: string }> },
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!ehDono(admin.role)) {
    return NextResponse.json({ error: "Só o dono da conta pode isto." }, { status: 403 });
  }

  const { chave } = await params;

  try {
    await removerCredencial(chave);
    await prisma.operationsAuditEvent.create({
      data: {
        actorId: admin.id,
        action: "PLATFORM_CREDENTIAL_DELETED",
        entityType: "PlatformCredential",
        entityId: chave,
      },
    });

    return NextResponse.json({ removida: chave });
  } catch {
    return NextResponse.json({ error: "Credencial não encontrada." }, { status: 404 });
  }
}
