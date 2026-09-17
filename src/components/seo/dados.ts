import type { prisma } from "@/lib/prisma";

/**
 * Tipos e derivações do SEO compartilhados entre a página (consultas) e os
 * componentes de servidor que desenham cada vista. Nada aqui consulta banco.
 */

export const P = {
  google: "google_search_console",
  indexnow: "indexnow",
  audit: "seo_audit",
  lighthouse: "lighthouse",
  bing: "bing_webmaster",
} as const;

export const PAGE_SIZE = 10;

export const BASE = "/hub-social/seo";

export type Params = {
  view?: string;
  domain?: string;
  tab?: string;
  integration?: string;
  q?: string;
  status?: string;
  page?: string;
};

export type Audit = {
  score?: number;
  robots?: { ok?: boolean };
  sitemap?: { ok?: boolean };
  llms?: { ok?: boolean };
  homeHtml?: { hasCanonical?: boolean };
};

export type Performance = { performanceScore?: number; lcp?: string; cls?: string; inp?: string };

export type Connection = Awaited<ReturnType<typeof prisma.integrationConnection.findFirst>>;

export type SeoItem = {
  domain: {
    id: string;
    organizationId: string;
    fqdn: string;
    status: string;
    cloudflareStatus: string | null;
    organization: { name: string };
    _count: { dnsRecords: number };
  };
  connected: boolean;
  verified: boolean;
  audit: Audit | undefined;
  issue: string | null;
};

export const property = (fqdn: string) => `sc-domain:${fqdn}`;

export const sitemap = (fqdn: string) => `https://${fqdn}/sitemap.xml`;

export const connectionData = (connection: Connection) =>
  connection
    ? {
        id: connection.id,
        status: connection.status,
        lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
        lastSyncStatus: connection.lastSyncStatus,
        lastSyncError: connection.lastSyncError,
        metadata: connection.metadata,
      }
    : null;

export const hrefDominio = (fqdn: string) => `${BASE}?domain=${encodeURIComponent(fqdn)}`;
