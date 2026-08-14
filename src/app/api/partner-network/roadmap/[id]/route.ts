import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { done?: unknown };
  if (typeof body.done !== "boolean") {
    return NextResponse.json({ error: "Informe o novo estado." }, { status: 400 });
  }

  try {
    const item = await prisma.partnerRoadmapItem.update({
      where: { id },
      data: {
        done: body.done,
        completedAt: body.done ? new Date() : null,
      },
    });

    return NextResponse.json({ ok: true, id: item.id, done: item.done });
  } catch {
    return NextResponse.json({ error: "Item não encontrado." }, { status: 404 });
  }
}
