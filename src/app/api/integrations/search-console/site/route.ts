import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { cleanText, sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { addSite } from "@/lib/search-console";

export const runtime = "nodejs";

const PROVIDER = "google_search_console";

export async function POST(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  }

  let body: { siteUrl?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const siteUrl = cleanText(body.siteUrl, 300);
  if (!siteUrl) {
    return NextResponse.json({ error: "Propriedade não informada." }, { status: 400 });
  }

  try {
    await addSite(siteUrl);

    const connection = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.integrationConnection.upsert({
        where: { provider_siteUrl: { provider: PROVIDER, siteUrl } },
        create: {
          provider: PROVIDER,
          siteUrl,
          status: "ACTIVE",
          lastSyncedAt: new Date(),
          lastSyncStatus: "SITE_ADDED",
        },
        update: {
          status: "ACTIVE",
          lastSyncedAt: new Date(),
          lastSyncStatus: "SITE_ADDED",
          lastSyncError: null,
        },
      });

      await transaction.operationsAuditEvent.create({
        data: {
          actorId: admin.id,
          action: "SEARCH_CONSOLE_SITE_ADDED",
          entityType: "IntegrationConnection",
          entityId: updated.id,
          metadata: { siteUrl },
        },
      });

      return updated;
    });

    return NextResponse.json({ ok: true, connection });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível cadastrar a propriedade no Search Console.";

    const connection = await prisma.integrationConnection.upsert({
      where: { provider_siteUrl: { provider: PROVIDER, siteUrl } },
      create: {
        provider: PROVIDER,
        siteUrl,
        status: "ERROR",
        lastSyncedAt: new Date(),
        lastSyncStatus: "ERROR",
        lastSyncError: message,
      },
      update: {
        status: "ERROR",
        lastSyncedAt: new Date(),
        lastSyncStatus: "ERROR",
        lastSyncError: message,
      },
    });

    return NextResponse.json({ ok: false, connection, error: message }, { status: 502 });
  }
}
