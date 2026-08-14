import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cleanText, sameOrigin } from "@/lib/http";
import { submitSitemap } from "@/lib/search-console";

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

  let body: { siteUrl?: unknown; sitemapUrl?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const siteUrl = cleanText(body.siteUrl, 300) || "https://avilaops.com/";
  const sitemapUrl = cleanText(body.sitemapUrl, 300) || "https://avilaops.com/sitemap.xml";

  try {
    await submitSitemap(siteUrl, sitemapUrl);

    const connection = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.integrationConnection.upsert({
        where: { provider_siteUrl: { provider: PROVIDER, siteUrl } },
        create: {
          provider: PROVIDER,
          siteUrl,
          status: "ACTIVE",
          lastSyncedAt: new Date(),
          lastSyncStatus: "SUCCESS",
        },
        update: {
          status: "ACTIVE",
          lastSyncedAt: new Date(),
          lastSyncStatus: "SUCCESS",
          lastSyncError: null,
        },
      });

      await transaction.operationsAuditEvent.create({
        data: {
          actorId: admin.id,
          action: "SEARCH_CONSOLE_SITEMAP_SUBMITTED",
          entityType: "IntegrationConnection",
          entityId: updated.id,
          metadata: { siteUrl, sitemapUrl },
        },
      });

      return updated;
    });

    return NextResponse.json({ ok: true, connection });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível enviar o sitemap ao Search Console.";

    await prisma.integrationConnection.upsert({
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

    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
