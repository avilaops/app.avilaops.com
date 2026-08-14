import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listSitemaps, listVerifiedSites } from "@/lib/search-console";

export const runtime = "nodejs";

const PROVIDER = "google_search_console";

export async function GET(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const siteUrl = request.nextUrl.searchParams.get("siteUrl") ?? "https://avilaops.com/";

  const connection = await prisma.integrationConnection.findUnique({
    where: { provider_siteUrl: { provider: PROVIDER, siteUrl } },
  });

  try {
    const [sitemaps, verifiedSites] = await Promise.all([
      listSitemaps(siteUrl),
      listVerifiedSites(),
    ]);

    return NextResponse.json({ connection, sitemaps, verifiedSites });
  } catch (error) {
    return NextResponse.json({
      connection,
      sitemaps: [],
      verifiedSites: [],
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível consultar o Search Console.",
    });
  }
}
