import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyServiceJwt } from "@/lib/service-auth";

export const runtime = "nodejs";

const PROVIDER = "tagflow";

export async function POST(request: NextRequest) {
  const caller = verifyServiceJwt(request);
  if (!caller) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: {
    clientId?: unknown;
    clientName?: unknown;
    domain?: unknown;
    ga4PropertyId?: unknown;
    ga4MeasurementId?: unknown;
    gtmPublicId?: unknown;
    gtmContainerId?: unknown;
    metaPixelId?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const clientId = typeof body.clientId === "string" ? body.clientId : "";
  const clientName = typeof body.clientName === "string" ? body.clientName : "";
  const domain = typeof body.domain === "string" ? body.domain : "";

  if (!clientId || !clientName || !domain) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  const existing = await prisma.integrationConnection.findUnique({
    where: { provider_siteUrl: { provider: PROVIDER, siteUrl: domain } },
  });
  const existingMetadata =
    existing?.metadata && typeof existing.metadata === "object"
      ? (existing.metadata as Record<string, unknown>)
      : {};

  // Mescla com o que já existe: um campo ausente no payload (ex.: rodar
  // `setup --no-gtm`) não deve apagar um valor já salvo antes.
  const metadata = {
    ...existingMetadata,
    clientId,
    clientName,
    ...(body.ga4PropertyId !== undefined ? { ga4PropertyId: body.ga4PropertyId } : {}),
    ...(body.ga4MeasurementId !== undefined ? { ga4MeasurementId: body.ga4MeasurementId } : {}),
    ...(body.gtmPublicId !== undefined ? { gtmPublicId: body.gtmPublicId } : {}),
    ...(body.gtmContainerId !== undefined ? { gtmContainerId: body.gtmContainerId } : {}),
    ...(body.metaPixelId !== undefined ? { metaPixelId: body.metaPixelId } : {}),
  };

  const connection = await prisma.integrationConnection.upsert({
    where: { provider_siteUrl: { provider: PROVIDER, siteUrl: domain } },
    create: {
      provider: PROVIDER,
      siteUrl: domain,
      status: "ACTIVE",
      lastSyncedAt: new Date(),
      lastSyncStatus: "SUCCESS",
      metadata,
    },
    update: {
      status: "ACTIVE",
      lastSyncedAt: new Date(),
      lastSyncStatus: "SUCCESS",
      metadata,
    },
  });

  return NextResponse.json({ ok: true, id: connection.id, updated_at: connection.updatedAt });
}
