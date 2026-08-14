import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { generateAccessToken } from "@/lib/deliverables";
import { saveDeliverableFile } from "@/lib/deliverable-storage";
import { sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  const { id: projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, organizationId: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Formulário inválido." }, { status: 400 });
  }

  const title = String(form.get("title") ?? "").trim().slice(0, 160);
  const description = String(form.get("description") ?? "").trim().slice(0, 2000);
  const amount = Number.parseFloat(String(form.get("amount") ?? ""));
  const recipientName = String(form.get("recipientName") ?? "").trim().slice(0, 120) || null;
  const recipientEmail = String(form.get("recipientEmail") ?? "").trim().slice(0, 160) || null;
  const previewFile = form.get("previewFile");
  const fullFile = form.get("fullFile");

  if (title.length < 3) {
    return NextResponse.json({ error: "Informe um título com pelo menos 3 caracteres." }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Informe um valor válido, maior que zero." }, { status: 400 });
  }
  if (!(fullFile instanceof File) || fullFile.size === 0) {
    return NextResponse.json({ error: "Envie o arquivo completo do entregável." }, { status: 400 });
  }
  if (fullFile.size > 100 * 1024 * 1024) {
    return NextResponse.json({ error: "Arquivo completo maior que 100 MB." }, { status: 400 });
  }

  const deliverable = await prisma.deliverable.create({
    data: {
      organizationId: project.organizationId,
      projectId: project.id,
      title,
      description: description || null,
      amount,
      accessToken: generateAccessToken(),
      recipientName,
      recipientEmail,
      status: "PUBLISHED",
    },
  });

  const fullBytes = Buffer.from(await fullFile.arrayBuffer());
  const { storedName: fullStoredName } = await saveDeliverableFile(
    deliverable.id,
    "full",
    fullFile.name,
    fullBytes,
  );

  let previewStoredName: string | null = null;
  let previewMimeType: string | null = null;
  if (previewFile instanceof File && previewFile.size > 0) {
    if (previewFile.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "Arquivo de prévia maior que 20 MB." }, { status: 400 });
    }
    const previewBytes = Buffer.from(await previewFile.arrayBuffer());
    const saved = await saveDeliverableFile(deliverable.id, "preview", previewFile.name, previewBytes);
    previewStoredName = saved.storedName;
    previewMimeType = previewFile.type || null;
  }

  const updated = await prisma.$transaction(async (transaction) => {
    const result = await transaction.deliverable.update({
      where: { id: deliverable.id },
      data: {
        fullFileName: fullStoredName,
        fullMimeType: fullFile.type || null,
        previewFileName: previewStoredName,
        previewMimeType,
      },
    });

    await transaction.operationsAuditEvent.create({
      data: {
        actorId: admin.id,
        organizationId: project.organizationId,
        action: "DELIVERABLE_CREATED",
        entityType: "Deliverable",
        entityId: deliverable.id,
        metadata: { title, amount, projectId: project.id },
      },
    });

    return result;
  });

  return NextResponse.json(
    { deliverable: { id: updated.id, accessToken: updated.accessToken } },
    { status: 201 },
  );
}
