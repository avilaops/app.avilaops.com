import crypto from "node:crypto";
import { exigirCredencial } from "@/lib/credenciais";
import { prisma } from "@/lib/prisma";
import { cifrarToken } from "@/lib/token-de-conexao";

export const THREADS_PROVIDER = "threads_login";
export const THREADS_STATE_COOKIE = "avila_threads_oauth_state";
export const THREADS_SCOPES = ["threads_basic", "threads_content_publish"];
export function threadsState(organizationId: string, actorId: string) {
  return `${organizationId}.${actorId}.${crypto.randomBytes(24).toString("hex")}`;
}
export function parseThreadsState(value: string | null) {
  const [organizationId, actorId, nonce, extra] = (value ?? "").split(".");
  return organizationId && actorId && /^[a-f0-9]{48}$/.test(nonce ?? "") && extra === undefined
    ? { organizationId, actorId } : null;
}
export function threadsCallback(origin: string) {
  return `${origin.replace(/\/$/, "")}/api/integrations/threads/oauth/callback`;
}
export async function threadsLoginUrl(origin: string, state: string) {
  const url = new URL("https://threads.net/oauth/authorize");
  url.search = new URLSearchParams({ client_id: await exigirCredencial("THREADS_APP_ID"),
    redirect_uri: threadsCallback(origin), response_type: "code", scope: THREADS_SCOPES.join(","), state }).toString();
  await exigirCredencial("THREADS_APP_SECRET");
  return url;
}

export async function threadsRequest<T>(path: string, token?: string, fields?: Record<string, string>, method = "GET"): Promise<T> {
  const url = new URL(`https://graph.threads.net${path}`);
  const params = new URLSearchParams(fields);
  if (method === "GET") url.search = params.toString();
  const response = await fetch(url, { method, cache: "no-store", signal: AbortSignal.timeout(20000),
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    ...(method === "POST" ? { body: params } : {}) });
  const data = await response.json().catch(() => null);
  // Never return provider bodies or token-bearing URLs to the UI/logs.
  if (!response.ok || !data || data.error) throw new Error(`Threads: a solicitação falhou (HTTP ${response.status}). Confira a autorização da conta.`);
  return data as T;
}

export async function connectThreads(origin: string, code: string, organizationId: string, actorId: string) {
  const appId = await exigirCredencial("THREADS_APP_ID");
  const secret = await exigirCredencial("THREADS_APP_SECRET");
  const short = await threadsRequest<{ access_token: string }>("/oauth/access_token", undefined, {
    client_id: appId, client_secret: secret, grant_type: "authorization_code", redirect_uri: threadsCallback(origin), code,
  }, "POST");
  if (!short.access_token) throw new Error("Threads não forneceu autorização.");
  const token = await threadsRequest<{ access_token: string; expires_in: number }>("/access_token", short.access_token,
    { grant_type: "th_exchange_token", client_secret: secret });
  if (!token.access_token || !Number.isFinite(token.expires_in) || token.expires_in <= 0) throw new Error("Threads retornou uma autorização sem validade.");
  const profile = await threadsRequest<{ id: string; username: string }>("/v1.0/me", token.access_token, { fields: "id,username" });
  if (!profile.id || !profile.username) throw new Error("Threads não retornou a conta autorizada.");
  const expiresAt = new Date(Date.now() + token.expires_in * 1000);
  const namespace = `threads:${appId}`;
  return prisma.$transaction(async tx => {
    // Serialize ownership checks for the same remote account, including first login.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${namespace + ":" + profile.id}, 0))`;
    const other = await tx.organizationIntegrationConnection.findFirst({ where: {
      provider: THREADS_PROVIDER, externalId: profile.id, organizationId: { not: organizationId },
    }, select: { id: true } });
    if (other) throw new Error("Esta conta do Threads já está vinculada a outra empresa.");
    const data = { externalId: profile.id, accountName: profile.username, status: "ACTIVE", tokenCiphertext: cifrarToken(token.access_token),
      // Profile retrieval proves basic access, not permission to publish.
      tokenType: "bearer", tokenExpiresAt: expiresAt, scopes: ["threads_basic"], lastSyncedAt: new Date(), lastSyncStatus: "CONNECTED",
      lastSyncError: null, metadata: { appId, requestedScopes: THREADS_SCOPES } };
    const legacy = await tx.organizationIntegrationConnection.upsert({ where: { organizationId_provider: { organizationId, provider: THREADS_PROVIDER } },
      create: { organizationId, provider: THREADS_PROVIDER, ...data }, update: data });
    const account = await tx.coreExternalAccount.upsert({ where: { provider_namespace_externalId: { provider: THREADS_PROVIDER, namespace, externalId: profile.id } },
      create: { provider: THREADS_PROVIDER, namespace, externalId: profile.id, displayName: profile.username }, update: { displayName: profile.username, observedAt: new Date() } });
    const authorization = { organizationId, externalAccountId: account.id, authorizedById: actorId, status: "AUTHORIZED", scopes: ["threads_basic"],
      authorizedAt: new Date(), expiresAt, revokedAt: null };
    await tx.coreConnection.upsert({ where: { legacyConnectionId: legacy.id }, create: { ...authorization, legacyConnectionId: legacy.id }, update: authorization });
    await tx.operationsAuditEvent.create({ data: { actorId, organizationId, action: "THREADS_CONNECTED", entityType: "OrganizationIntegrationConnection", entityId: legacy.id } });
    return { username: profile.username };
  });
}
