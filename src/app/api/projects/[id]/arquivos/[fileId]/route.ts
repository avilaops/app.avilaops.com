import { NextResponse, type NextRequest } from "next/server";
import { Readable } from "node:stream";
import { getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import {
  getOrganizationBrandAssetPrivateUrl,
  readLocalOrganizationBrandAsset,
} from "@/lib/brand-asset-storage";

/**
 * Cabeçalho HTTP não carrega caractere fora do Latin-1: um nome como
 * "proposta — v2.pdf" (travessão) derrubava a resposta com TypeError, e acento
 * chegava embaralhado. O nome real vai em `filename*` (RFC 5987) e uma versão
 * ASCII fica de reserva no `filename`.
 */
function dispositionInline(nome: string) {
  const ascii = nome.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "");
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
}

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
        "Content-Disposition": dispositionInline(arquivo.name),
        "Cache-Control": "private, max-age=60",
        // `nosniff`: o navegador não reinterpreta o tipo declarado.
        "X-Content-Type-Options": "nosniff",
        // O arquivo vem de fora (cliente, fornecedor) e é servido na origem do
        // painel: um SVG aberto direto com <script> rodaria com a sessão de
        // quem abrisse. `sandbox` só no SVG, porque no PDF ele bloqueia o
        // visualizador do Chrome.
        ...(arquivo.mimeType === "image/svg+xml"
          ? { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" }
          : {}),
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
