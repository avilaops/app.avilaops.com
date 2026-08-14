import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cleanText } from "@/lib/http";
import { verifyServiceJwt } from "@/lib/service-auth";
import { classifyCpfCnpj } from "@/lib/cpf-cnpj";
import { saveClientDocumentFile } from "@/lib/client-document-storage";

export const runtime = "nodejs";

const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);
const MAX_DOCUMENTS = 3;
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

type IncomingDocument = {
  fileName?: unknown;
  mimeType?: unknown;
  contentBase64?: unknown;
};

export async function POST(request: NextRequest) {
  const caller = verifyServiceJwt(request);
  if (!caller) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: {
    nome?: unknown;
    email?: unknown;
    telefone?: unknown;
    cpfCnpj?: unknown;
    empresa?: unknown;
    documentos?: IncomingDocument[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const nome = cleanText(body.nome, 200);
  const email = cleanText(body.email, 200);
  const telefone = cleanText(body.telefone, 60);
  const empresa = cleanText(body.empresa, 200);
  const cpfCnpjRaw = cleanText(body.cpfCnpj, 20);

  if (!nome || !email || !cpfCnpjRaw) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  const classified = classifyCpfCnpj(cpfCnpjRaw);
  if (!classified || !classified.valid) {
    return NextResponse.json({ ok: false, error: "invalid_cpf_cnpj" }, { status: 400 });
  }

  const documentosInput = Array.isArray(body.documentos) ? body.documentos : [];
  if (documentosInput.length === 0) {
    return NextResponse.json({ ok: false, error: "documents_required" }, { status: 400 });
  }
  if (documentosInput.length > MAX_DOCUMENTS) {
    return NextResponse.json({ ok: false, error: "too_many_documents" }, { status: 400 });
  }

  const decodedDocuments: { fileName: string; mimeType: string; buffer: Buffer }[] = [];
  for (const doc of documentosInput) {
    const fileName = cleanText(doc.fileName, 200);
    const mimeType = cleanText(doc.mimeType, 100);
    const contentBase64 = typeof doc.contentBase64 === "string" ? doc.contentBase64 : "";

    if (!fileName || !ALLOWED_MIME_TYPES.has(mimeType) || !contentBase64) {
      return NextResponse.json({ ok: false, error: "invalid_document" }, { status: 400 });
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(contentBase64, "base64");
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_document" }, { status: 400 });
    }
    if (buffer.length === 0 || buffer.length > MAX_DOCUMENT_BYTES) {
      return NextResponse.json({ ok: false, error: "document_too_large" }, { status: 400 });
    }

    decodedDocuments.push({ fileName, mimeType, buffer });
  }

  const existingPending = await prisma.clientRegistrationRequest.findFirst({
    where: { cpfCnpj: classified.digits, status: "PENDING" },
    select: { id: true },
  });
  if (existingPending) {
    return NextResponse.json({ ok: false, error: "already_pending" }, { status: 409 });
  }

  const requestId = crypto.randomUUID();
  const documentos = [];
  try {
    for (const doc of decodedDocuments) {
      const key = await saveClientDocumentFile(requestId, doc.fileName, doc.buffer, doc.mimeType);
      documentos.push({
        key,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        sizeBytes: doc.buffer.length,
      });
    }
  } catch (error) {
    console.error("[client-registration-requests] falha ao enviar documento ao R2:", error);
    return NextResponse.json(
      { ok: false, error: "document_storage_unavailable" },
      { status: 502 }
    );
  }

  const created = await prisma.clientRegistrationRequest.create({
    data: {
      id: requestId,
      nome,
      email,
      telefone: telefone || null,
      cpfCnpj: classified.digits,
      tipoDocumento: classified.kind,
      empresa: empresa || null,
      documentos,
    },
  });

  await prisma.operationsAuditEvent.create({
    data: {
      action: "CLIENT_REGISTRATION_REQUEST_CREATED",
      entityType: "ClientRegistrationRequest",
      entityId: created.id,
      metadata: { via: caller.iss },
    },
  });

  return NextResponse.json({ ok: true, id: created.id, created_at: created.criadoEm });
}
