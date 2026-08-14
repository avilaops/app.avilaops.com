import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { cleanText, sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { saveOrganizationBrandAssetFile } from "@/lib/brand-asset-storage";

const MAX_FILE_SIZE = 12 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/x-icon",
  "application/pdf",
]);

function extensionOf(fileName: string) {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return match?.[1] ?? "";
}

function validateExtension(mimeType: string, extension: string) {
  const allowed: Record<string, string[]> = {
    "image/png": ["png"],
    "image/jpeg": ["jpg", "jpeg"],
    "image/webp": ["webp"],
    "image/svg+xml": ["svg"],
    "image/x-icon": ["ico"],
    "application/pdf": ["pdf"],
  };
  return allowed[mimeType]?.includes(extension) ?? false;
}

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

  const { id } = await params;
  const organization = await prisma.organization.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!organization) {
    return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const assetType = cleanText(form.get("assetType"), 80);
  const notes = cleanText(form.get("notes"), 500);
  const dimensions = cleanText(form.get("dimensions"), 60);

  if (!assetType) {
    return NextResponse.json({ error: "Informe o tipo do ativo." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Envie um arquivo válido." }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "Arquivo deve ter até 12 MB." },
      { status: 400 },
    );
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Formato permitido: PNG, JPG, WEBP, SVG, ICO ou PDF." },
      { status: 400 },
    );
  }
  const extension = extensionOf(file.name);
  if (!validateExtension(file.type, extension)) {
    return NextResponse.json(
      { error: "Extensão do arquivo não corresponde ao formato enviado." },
      { status: 400 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const storageKey = await saveOrganizationBrandAssetFile(
    id,
    assetType,
    file.name,
    bytes,
    file.type,
  );

  const asset = await prisma.$transaction(async (transaction) => {
    const previousCount = await transaction.organizationBrandAsset.count({
      where: { organizationId: id, assetType },
    });

    await transaction.organizationBrandAsset.updateMany({
      where: { organizationId: id, assetType, isCurrent: true },
      data: { isCurrent: false },
    });

    const created = await transaction.organizationBrandAsset.create({
      data: {
        organizationId: id,
        assetType,
        name: file.name,
        storageKey,
        format: extension,
        mimeType: file.type,
        dimensions: dimensions || null,
        sizeBytes: file.size,
        version: String(previousCount + 1),
        isCurrent: true,
        notes: notes || null,
        uploadedBy: admin.email,
      },
      select: {
        id: true,
        assetType: true,
        name: true,
        mimeType: true,
        sizeBytes: true,
        version: true,
        isCurrent: true,
      },
    });

    await transaction.operationsAuditEvent.create({
      data: {
        actorId: admin.id,
        organizationId: id,
        action: "ORGANIZATION_BRAND_ASSET_UPLOADED",
        entityType: "OrganizationBrandAsset",
        entityId: created.id,
        metadata: {
          assetType,
          mimeType: file.type,
          sizeBytes: file.size,
          version: created.version,
        },
      },
    });

    return created;
  });

  return NextResponse.json({ asset }, { status: 201 });
}
