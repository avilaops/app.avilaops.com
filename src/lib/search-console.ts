import { google } from "googleapis";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createTxtRecord, listDnsRecords } from "@/lib/cloudflare";

function getCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON não configurado");
  }
  return JSON.parse(raw);
}

async function getSearchConsoleClient() {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: getCredentials(),
      scopes: [
        "https://www.googleapis.com/auth/webmasters",
        "https://www.googleapis.com/auth/siteverification",
      ],
    });
    const client = await auth.getClient();
    return google.searchconsole({ version: "v1", auth: client as never });
  } catch (err) {
    console.error("Falha ao autenticar Google Search Console client:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

async function getSiteVerificationClient() {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: getCredentials(),
      scopes: [
        "https://www.googleapis.com/auth/webmasters",
        "https://www.googleapis.com/auth/siteverification",
      ],
    });
    const client = await auth.getClient();
    return google.siteVerification({ version: "v1", auth: client as never });
  } catch (err) {
    console.error("Falha ao autenticar Site Verification client:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function submitSitemap(siteUrl: string, sitemapUrl: string) {
  const searchconsole = await getSearchConsoleClient();
  if (!searchconsole) throw new Error("Google Search Console indisponível ou não configurado.");
  await searchconsole.sitemaps.submit({ siteUrl, feedpath: sitemapUrl });
}

export async function addSite(siteUrl: string) {
  const searchconsole = await getSearchConsoleClient();
  if (!searchconsole) throw new Error("Google Search Console indisponível ou não configurado.");
  await searchconsole.sites.add({ siteUrl });
}

export async function getDomainVerificationToken(fqdn: string) {
  const siteVerification = await getSiteVerificationClient();
  if (!siteVerification) throw new Error("Google Site Verification indisponível ou não configurado.");
  const response = await siteVerification.webResource.getToken({
    requestBody: {
      site: {
        type: "INET_DOMAIN",
        identifier: fqdn,
      },
      verificationMethod: "DNS_TXT",
    },
  });

  if (!response.data.token) {
    throw new Error("Google não retornou token de verificação DNS.");
  }

  return response.data.token;
}

export async function verifyDomainWithGoogle(fqdn: string) {
  const siteVerification = await getSiteVerificationClient();
  if (!siteVerification) throw new Error("Google Site Verification indisponível ou não configurado.");
  await siteVerification.webResource.insert({
    verificationMethod: "DNS_TXT",
    requestBody: {
      site: {
        type: "INET_DOMAIN",
        identifier: fqdn,
      },
    },
  });
}

export async function provisionSearchConsoleDomainVerification(fqdn: string) {
  const domain = await prisma.domainAsset.findUnique({
    where: { fqdn },
    include: { dnsRecords: true },
  });
  if (!domain?.cloudflareZoneId) {
    throw new Error("Domínio não possui zona Cloudflare vinculada.");
  }

  const token = await getDomainVerificationToken(fqdn);
  const existingRecord = domain.dnsRecords.find(
    (record) => record.type === "TXT" && record.name === fqdn && record.content === token,
  );

  let cloudflareRecordId = existingRecord?.cloudflareRecordId ?? null;
  if (!existingRecord) {
    const cloudflareRecord = await createTxtRecord(domain.cloudflareZoneId, fqdn, token);
    cloudflareRecordId = cloudflareRecord.id;

    await prisma.dnsRecord.upsert({
      where: { cloudflareRecordId: cloudflareRecord.id },
      create: {
        domainAssetId: domain.id,
        cloudflareRecordId: cloudflareRecord.id,
        type: cloudflareRecord.type,
        name: cloudflareRecord.name,
        content: cloudflareRecord.content,
        proxied: cloudflareRecord.proxied,
        ttl: cloudflareRecord.ttl,
        priority: cloudflareRecord.priority ?? null,
      },
      update: {
        type: cloudflareRecord.type,
        name: cloudflareRecord.name,
        content: cloudflareRecord.content,
        proxied: cloudflareRecord.proxied,
        ttl: cloudflareRecord.ttl,
        priority: cloudflareRecord.priority ?? null,
      },
    });
  }

  return {
    fqdn,
    siteUrl: `sc-domain:${fqdn}`,
    token,
    cloudflareRecordId,
  };
}

export async function refreshDomainDnsRecords(fqdn: string) {
  const domain = await prisma.domainAsset.findUnique({ where: { fqdn } });
  if (!domain?.cloudflareZoneId) return;

  const records = await listDnsRecords(domain.cloudflareZoneId);
  for (const record of records) {
    await prisma.dnsRecord.upsert({
      where: { cloudflareRecordId: record.id },
      create: {
        domainAssetId: domain.id,
        cloudflareRecordId: record.id,
        type: record.type,
        name: record.name,
        content: record.content,
        proxied: record.proxied,
        ttl: record.ttl,
        priority: record.priority ?? null,
      },
      update: {
        type: record.type,
        name: record.name,
        content: record.content,
        proxied: record.proxied,
        ttl: record.ttl,
        priority: record.priority ?? null,
      },
    });
  }

  await prisma.domainAsset.update({
    where: { id: domain.id },
    data: { dnsLastSyncedAt: new Date() },
  });
}

export async function listSitemaps(siteUrl: string) {
  try {
    const searchconsole = await getSearchConsoleClient();
    if (!searchconsole) return [];
    const res = await searchconsole.sitemaps.list({ siteUrl });
    return res.data.sitemap ?? [];
  } catch (err) {
    console.error("Aviso: Falha ao listar sitemaps no GSC (rede ou credencial):", err instanceof Error ? err.message : String(err));
    return [];
  }
}

export async function listVerifiedSites() {
  try {
    const searchconsole = await getSearchConsoleClient();
    if (!searchconsole) return [];
    const res = await searchconsole.sites.list();
    return res.data.siteEntry ?? [];
  } catch (err) {
    console.error("Aviso: Falha ao listar sites verificados no GSC (rede ou credencial):", err instanceof Error ? err.message : String(err));
    return [];
  }
}

export async function auditPublicSitemap(fqdn: string) {
  const sitemapUrl = `https://${fqdn}/sitemap.xml`;
  const startedAt = new Date();
  let ok = false;
  let status: number | null = null;
  let contentType: string | null = null;
  let bytes = 0;
  let urlCount = 0;
  let error: string | null = null;

  try {
    const response = await fetch(sitemapUrl, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    status = response.status;
    contentType = response.headers.get("content-type");
    const body = await response.text();
    bytes = Buffer.byteLength(body);
    urlCount = (body.match(/<url>/g) ?? []).length;
    ok =
      response.ok &&
      Boolean(contentType?.includes("xml") || body.includes("<urlset") || body.includes("<sitemapindex"));
    if (!ok) {
      error = `Sitemap retornou HTTP ${status} ou conteúdo inválido.`;
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Falha ao consultar sitemap público.";
  }

  return {
    ok,
    sitemapUrl,
    status,
    contentType,
    bytes,
    urlCount,
    error,
    checkedAt: startedAt.toISOString(),
  };
}

export async function saveSitemapAudit(fqdn: string) {
  const siteUrl = `sc-domain:${fqdn}`;
  const audit = await auditPublicSitemap(fqdn);
  const existing = await prisma.integrationConnection.findUnique({
    where: { provider_siteUrl: { provider: "google_search_console", siteUrl } },
  });
  const previousMetadata =
    existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
      ? (existing.metadata as Record<string, unknown>)
      : {};

  const connection = await prisma.integrationConnection.upsert({
    where: { provider_siteUrl: { provider: "google_search_console", siteUrl } },
    create: {
      provider: "google_search_console",
      siteUrl,
      status: "ACTIVE",
      lastSyncedAt: new Date(),
      lastSyncStatus: audit.ok ? "SITEMAP_AUDITED" : "SITEMAP_ERROR",
      lastSyncError: audit.error,
      metadata: {
        fqdn,
        sitemapAudit: audit,
      } satisfies Prisma.InputJsonObject,
    },
    update: {
      status: "ACTIVE",
      lastSyncedAt: new Date(),
      lastSyncStatus: audit.ok ? "SITEMAP_AUDITED" : "SITEMAP_ERROR",
      lastSyncError: audit.error,
      metadata: {
        ...previousMetadata,
        fqdn,
        sitemapAudit: audit,
      } satisfies Prisma.InputJsonObject,
    },
  });

  return { audit, connection };
}
