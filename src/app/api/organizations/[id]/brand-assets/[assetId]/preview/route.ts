import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { getAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getOrganizationBrandAssetPrivateUrl,
  readLocalOrganizationBrandAsset,
} from "@/lib/brand-asset-storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> },
) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }

  const { id, assetId } = await params;
  const asset = await prisma.organizationBrandAsset.findFirst({
    where: { id: assetId, organizationId: id },
    select: { storageKey: true, mimeType: true, name: true },
  });

  if (!asset?.storageKey) {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }

  const localStream = readLocalOrganizationBrandAsset(asset.storageKey);
  if (localStream) {
    const webStream = Readable.toWeb(localStream) as ReadableStream;
    return new Response(webStream, {
      headers: {
        "Content-Type": asset.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${(asset.name ?? "asset").replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  }

  const url = await getOrganizationBrandAssetPrivateUrl(asset.storageKey);
  if (!url) {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }
  return NextResponse.redirect(url);
}
