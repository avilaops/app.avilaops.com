import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { getAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getClientDocumentUrl,
  readLocalClientDocument,
} from "@/lib/client-document-storage";
import type { RegistrationRequestDocument } from "@/lib/client-registration-requests";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; key: string }> },
) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }

  const { id, key } = await params;
  const decodedKey = decodeURIComponent(key);

  const request = await prisma.clientRegistrationRequest.findUnique({
    where: { id },
    select: { documentos: true },
  });
  if (!request) {
    return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });
  }

  const documentos = (request.documentos as unknown as RegistrationRequestDocument[]) ?? [];
  const doc = documentos.find((item) => item.key === decodedKey);
  if (!doc) {
    return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  }

  const localStream = readLocalClientDocument(doc.key);
  if (localStream) {
    const webStream = Readable.toWeb(localStream) as ReadableStream;
    return new Response(webStream, {
      headers: {
        "Content-Type": doc.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${doc.fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  }

  const url = await getClientDocumentUrl(doc.key);
  if (!url) {
    return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  }
  return NextResponse.redirect(url);
}
