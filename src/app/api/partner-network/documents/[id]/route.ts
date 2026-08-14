import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const allowedStatuses = new Set(["NOT_STARTED", "IN_PROGRESS", "DONE"]);

function optionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    status?: unknown;
    linkUrl?: unknown;
    note?: unknown;
  };

  const status = typeof body.status === "string" ? body.status : "";
  if (!allowedStatuses.has(status)) {
    return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
  }

  const linkUrl = optionalText(body.linkUrl, 500);
  const note = optionalText(body.note, 300);

  try {
    const doc = await prisma.partnerDocument.update({
      where: { id },
      data: { status, linkUrl, note, updatedBy: admin.id },
    });

    return NextResponse.json({ ok: true, id: doc.id, status: doc.status });
  } catch {
    return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  }
}
