import { NextRequest, NextResponse } from "next/server";
import { getAdminOuChave, rastroDaChave } from "@/lib/chaves-api";
import { cleanText, sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { saveOrganizationBrandAssetFile } from "@/lib/brand-asset-storage";

/**
 * Mídia do projeto: imagem, PDF ou vídeo curto que sustenta o combinado.
 *
 * O binário reaproveita o armazenamento dos ativos de marca (R2 quando
 * configurado, disco quando não), com `assetType` = `projeto-<id>`. Inventar um
 * segundo lugar para guardar arquivo significaria uma segunda configuração de
 * R2 para esquecer e um segundo caminho de disco para encher.
 */

const TAMANHO_MAXIMO = 25 * 1024 * 1024;

const TIPOS: Record<string, { kind: string; extensoes: string[] }> = {
  "image/png": { kind: "imagem", extensoes: ["png"] },
  "image/jpeg": { kind: "imagem", extensoes: ["jpg", "jpeg"] },
  "image/webp": { kind: "imagem", extensoes: ["webp"] },
  "image/gif": { kind: "imagem", extensoes: ["gif"] },
  "image/svg+xml": { kind: "imagem", extensoes: ["svg"] },
  "application/pdf": { kind: "pdf", extensoes: ["pdf"] },
  "video/mp4": { kind: "video", extensoes: ["mp4"] },
  "video/webm": { kind: "video", extensoes: ["webm"] },
};

function extensaoDe(nome: string) {
  return nome.toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1] ?? "";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { admin, erro } = await getAdminOuChave(request, "projetos:escrever");
  if (!admin) {
    return NextResponse.json({ error: erro ?? "Acesso não autorizado." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  const { id } = await params;
  const projeto = await prisma.project.findUnique({
    where: { id },
    select: { id: true, organizationId: true },
  });
  if (!projeto) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const form = await request.formData();
  const arquivos = form.getAll("file").filter((item): item is File => item instanceof File);
  const notes = cleanText(form.get("notes"), 500);

  if (arquivos.length === 0) {
    return NextResponse.json({ error: "Envie ao menos um arquivo." }, { status: 400 });
  }
  if (arquivos.length > 10) {
    return NextResponse.json({ error: "Até 10 arquivos por vez." }, { status: 400 });
  }

  const gravados = [];

  for (const arquivo of arquivos) {
    const tipo = TIPOS[arquivo.type];
    if (!tipo) {
      return NextResponse.json(
        { error: `Tipo não aceito em "${arquivo.name}". Use imagem, PDF, MP4 ou WebM.` },
        { status: 400 },
      );
    }

    // O mime vem do navegador e é chute dele; sem conferir a extensão, um .exe
    // renomeado entra dizendo que é PDF.
    if (!tipo.extensoes.includes(extensaoDe(arquivo.name))) {
      return NextResponse.json(
        { error: `A extensão de "${arquivo.name}" não bate com o tipo do arquivo.` },
        { status: 400 },
      );
    }

    if (arquivo.size <= 0 || arquivo.size > TAMANHO_MAXIMO) {
      return NextResponse.json(
        { error: `"${arquivo.name}" precisa ter entre 1 byte e 25 MB.` },
        { status: 400 },
      );
    }

    const storageKey = await saveOrganizationBrandAssetFile(
      projeto.organizationId,
      `projeto-${projeto.id}`,
      arquivo.name,
      Buffer.from(await arquivo.arrayBuffer()),
      arquivo.type,
    );

    gravados.push(
      await prisma.projectFile.create({
        data: {
          projectId: projeto.id,
          name: arquivo.name.slice(0, 200),
          kind: tipo.kind,
          mimeType: arquivo.type,
          sizeBytes: arquivo.size,
          storageKey,
          notes: notes || null,
          uploadedBy: admin.email,
        },
        select: { id: true, name: true, kind: true, sizeBytes: true, createdAt: true },
      }),
    );
  }

  await prisma.operationsAuditEvent.create({
    data: {
      actorId: admin.id,
      organizationId: projeto.organizationId,
      action: "PROJECT_FILES_UPLOADED",
      entityType: "Project",
      entityId: projeto.id,
      metadata: { ...rastroDaChave(admin), quantidade: gravados.length, nomes: gravados.map((g) => g.name) },
    },
  });

  return NextResponse.json({ arquivos: gravados }, { status: 201 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { admin, erro } = await getAdminOuChave(request, "projetos:ler");
  if (!admin) {
    return NextResponse.json({ error: erro ?? "Acesso não autorizado." }, { status: 401 });
  }

  const { id } = await params;
  const arquivos = await prisma.projectFile.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      kind: true,
      mimeType: true,
      sizeBytes: true,
      notes: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ arquivos });
}
