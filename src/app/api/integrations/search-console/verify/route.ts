import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { cleanText, sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import {
  addSite,
  provisionSearchConsoleDomainVerification,
  refreshDomainDnsRecords,
  verifyDomainWithGoogle,
} from "@/lib/search-console";

export const runtime = "nodejs";

const PROVIDER = "google_search_console";

function domainFromSiteUrl(siteUrl: string) {
  return siteUrl.startsWith("sc-domain:") ? siteUrl.replace("sc-domain:", "") : "";
}

export async function POST(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  }

  let body: { siteUrl?: unknown; fqdn?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const siteUrl = cleanText(body.siteUrl, 300);
  const fqdn = cleanText(body.fqdn, 300) || domainFromSiteUrl(siteUrl);
  if (!fqdn) {
    return NextResponse.json({ error: "Domínio não informado." }, { status: 400 });
  }

  const targetSiteUrl = `sc-domain:${fqdn}`;

  try {
    const verification = await provisionSearchConsoleDomainVerification(fqdn);
    await refreshDomainDnsRecords(fqdn);

    let verified = false;
    let verifyError: string | null = null;
    try {
      await verifyDomainWithGoogle(fqdn);
      await addSite(targetSiteUrl);
      verified = true;
    } catch (error) {
      verifyError =
        error instanceof Error
          ? error.message
          : "Google ainda não confirmou o TXT de verificação.";
    }

    const connection = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.integrationConnection.upsert({
        where: { provider_siteUrl: { provider: PROVIDER, siteUrl: targetSiteUrl } },
        create: {
          provider: PROVIDER,
          siteUrl: targetSiteUrl,
          status: verified ? "ACTIVE" : "PENDING",
          lastSyncedAt: new Date(),
          lastSyncStatus: verified ? "VERIFIED" : "DNS_TXT_CREATED",
          lastSyncError: verifyError,
          metadata: {
            fqdn,
            cloudflareRecordId: verification.cloudflareRecordId,
            verificationMethod: "DNS_TXT",
          },
        },
        update: {
          status: verified ? "ACTIVE" : "PENDING",
          lastSyncedAt: new Date(),
          lastSyncStatus: verified ? "VERIFIED" : "DNS_TXT_CREATED",
          lastSyncError: verifyError,
          metadata: {
            fqdn,
            cloudflareRecordId: verification.cloudflareRecordId,
            verificationMethod: "DNS_TXT",
          },
        },
      });

      await transaction.operationsAuditEvent.create({
        data: {
          actorId: admin.id,
          action: verified
            ? "SEARCH_CONSOLE_DOMAIN_VERIFIED"
            : "SEARCH_CONSOLE_DNS_TXT_CREATED",
          entityType: "IntegrationConnection",
          entityId: updated.id,
          metadata: {
            siteUrl: targetSiteUrl,
            fqdn,
            cloudflareRecordId: verification.cloudflareRecordId,
            verified,
            verifyError,
          },
        },
      });

      return updated;
    });

    return NextResponse.json({
      ok: verified,
      pending: !verified,
      connection,
      error: verifyError,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível preparar a verificação DNS.";

    const connection = await prisma.integrationConnection.upsert({
      where: { provider_siteUrl: { provider: PROVIDER, siteUrl: targetSiteUrl } },
      create: {
        provider: PROVIDER,
        siteUrl: targetSiteUrl,
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
