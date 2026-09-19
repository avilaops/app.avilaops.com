import { NextResponse, type NextRequest } from "next/server";
import { Readable } from "node:stream";
import { getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import {
  getOrganizationBrandAssetPrivateUrl,
  readLocalOrganizationBrandAsset,
} from "@/lib/brand-asset-storage";

/** Serve o arquivo do projeto. Mesmo caminho dos ativos de marca. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }

  const { id, fileId } = await params;
  // O projectId entra na busca para a URL de um projeto nao servir arquivo de
  // outro so por adivinhar o id do arquivo.
  const arquivo = await prisma.projectFile.findFirst({
    where: { id: fileId, projectId: id },
    select: { storageKey: true, mimeType: true, name: true },
  });
  if (!arquivo) {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }

  const local = readLocalOrganizationBrandAsset(arquivo.storageKey);
  if (local) {
    return new Response(Readable.toWeb(local) as ReadableStream, {
      headers: {
        "Content-Type": arquivo.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${arquivo.name.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  }

  const url = await getOrganizationBrandAssetPrivateUrl(arquivo.storageKey);
  if (!url) {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }
  return NextResponse.redirect(url);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  const { id, fileId } = await params;
  const arquivo = await prisma.projectFile.findFirst({
    where: { id: fileId, projectId: id },
    select: { id: true, name: true, project: { select: { organizationId: true } } },
  });
  if (!arquivo) {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }

  // O binário fica no armazenamento de propósito: some da tela, continua
  // recuperável. Remoção definitiva é decisão de quem administra o bucket, não
  // efeito colateral de um clique numa lista.
  await prisma.projectFile.delete({ where: { id: arquivo.id } });

  await prisma.operationsAuditEvent.create({
    data: {
      actorId: admin.id,
      organizationId: arquivo.project.organizationId,
      action: "PROJECT_FILE_REMOVED",
      entityType: "Project",
      entityId: id,
      metadata: { nome: arquivo.name },
    },
  });

  return NextResponse.json({ removido: arquivo.id });
}
