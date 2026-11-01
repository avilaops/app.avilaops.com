import crypto from "node:crypto";
import { exigirCredencial } from "@/lib/credenciais";
import { prisma } from "@/lib/prisma";
import { cifrarToken, decifrarToken } from "@/lib/token-de-conexao";

export const THREADS_PROVIDER = "threads_login";
export const THREADS_STATE_COOKIE = "avila_threads_oauth_state";
export const THREADS_SCOPES = ["threads_basic", "threads_content_publish", "threads_manage_insights"];
export const THREADS_GRAPH = "https://graph.threads.com/v1.0";

class ThreadsRequestError extends Error {
  constructor(readonly httpStatus: number, readonly providerCode: number | null, readonly providerSubcode: number | null) {
    super(`Threads: a solicitação falhou (HTTP ${httpStatus}). Confira a autorização da conta.`);
  }
}

type ThreadsConnectionStage = "credentials" | "authorization_code" | "long_lived_token" | "profile" | "permissions" | "persistence";

async function etapaConexaoThreads<T>(stage: ThreadsConnectionStage, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    // Only allowlisted diagnostics: never log error messages, bodies, URLs or credentials.
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    console.error("[threads.oauth.failed]", {
      stage,
      httpStatus: error instanceof ThreadsRequestError ? error.httpStatus : null,
      providerCode: error instanceof ThreadsRequestError ? error.providerCode : null,
      providerSubcode: error instanceof ThreadsRequestError ? error.providerSubcode : null,
      databaseCode: typeof code === "string" && /^P\d{4}$/.test(code) ? code : null,
    });
    throw error;
  }
}
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
  const url = new URL("https://threads.com/oauth/authorize");
  url.search = new URLSearchParams({ client_id: await exigirCredencial("THREADS_APP_ID"),
    redirect_uri: threadsCallback(origin), response_type: "code", scope: THREADS_SCOPES.join(","), state }).toString();
  await exigirCredencial("THREADS_APP_SECRET");
  return url;
}

export async function threadsRequest<T>(path: string, token?: string, fields?: Record<string, string>, method = "GET"): Promise<T> {
  if (!/^\/(?:v\d+\.\d+\/)?[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(path)) throw new Error("Caminho Threads inválido.");
  const url = new URL(`https://graph.threads.com${path}`);
  const params = new URLSearchParams(fields);
  if (method === "GET") url.search = params.toString();
  const response = await fetch(url, { method, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000),
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    ...(method === "POST" ? { body: params } : {}) });
  const data = await response.json().catch(() => null);
  // Never return provider bodies or token-bearing URLs to the UI/logs.
  if (!response.ok || !data || data.error) throw new ThreadsRequestError(response.status,
    Number.isSafeInteger(data?.error?.code) ? data.error.code : null,
    Number.isSafeInteger(data?.error?.error_subcode) ? data.error.error_subcode : null);
  return data as T;
}

export async function conferirPermissoesThreads(token: string, userId: string) {
  const appId = await exigirCredencial("THREADS_APP_ID");
  const secret = await exigirCredencial("THREADS_APP_SECRET");
  const result = await threadsRequest<{ data?: { is_valid?: boolean; user_id?: string; scopes?: unknown; expires_at?: number; data_access_expires_at?: number } }>(
    "/v1.0/debug_token", undefined, { access_token: `TH|${appId}|${secret}`, input_token: token },
  );
  const data = result.data;
  const now = Date.now() / 1000;
  if (!data?.is_valid || data.user_id !== userId || !Array.isArray(data.scopes)
    || [data.expires_at, data.data_access_expires_at].some(expiry => typeof expiry === "number" && expiry > 0 && expiry <= now)) {
    throw new Error("Autorização Threads inválida ou vencida. Reconecte a conta.");
  }
  return data.scopes.filter((scope): scope is string => typeof scope === "string" && THREADS_SCOPES.includes(scope));
}

/** Never exports credentials to a consumer or browser. Validate ownership before decrypting. */
export async function tokenDaEmpresaThreads(organizationId: string, scope: string, expectedId?: string) {
  const organization = await prisma.organization.findFirst({ where: { id: organizationId, status: { not: "ARCHIVED" } }, select: { id: true } });
  if (!organization) throw new Error("Empresa indisponível.");
  const connection = await prisma.organizationIntegrationConnection.findUnique({
    where: { organizationId_provider: { organizationId, provider: THREADS_PROVIDER } },
  });
  if (!connection || connection.status !== "ACTIVE" || !connection.externalId || !connection.tokenCiphertext
    || !connection.tokenExpiresAt || connection.tokenExpiresAt <= new Date()
    || (expectedId !== undefined && connection.externalId !== expectedId)) {
    throw new Error("Conexão Threads indisponível para esta empresa e conta.");
  }
  const token = decifrarToken(connection.tokenCiphertext);
  const scopes = await conferirPermissoesThreads(token, connection.externalId);
  if (!scopes.includes(scope)) throw new Error("Permissão Threads não concedida. Reconecte a conta.");
  return { token, id: connection.externalId };
}

export async function estadoThreads(organizationId: string) {
  const connection = await prisma.organizationIntegrationConnection.findUnique({
    where: { organizationId_provider: { organizationId, provider: THREADS_PROVIDER } },
    select: { externalId: true, accountName: true, status: true, scopes: true, tokenExpiresAt: true, lastSyncedAt: true },
  });
  const connected = Boolean(connection?.status === "ACTIVE" && connection.tokenExpiresAt && connection.tokenExpiresAt > new Date());
  const scopes = Array.isArray(connection?.scopes) ? connection.scopes : [];
  return { connected, account: connection ? { id: connection.externalId, username: connection.accountName,
    expiresAt: connection.tokenExpiresAt?.toISOString() ?? null, checkedAt: connection.lastSyncedAt?.toISOString() ?? null } : null,
    capabilities: { publish: connected && scopes.includes("threads_content_publish"),
      insights: connected && scopes.includes("threads_manage_insights") } };
}

export async function metricasThreads(organizationId: string) {
  const { token, id } = await tokenDaEmpresaThreads(organizationId, "threads_manage_insights");
  const until = Math.floor(Date.now() / 1000);
  const since = until - 7 * 24 * 60 * 60;
  const response = await threadsRequest<{ data?: { name: string; period?: string; values?: { value: unknown; end_time?: string }[]; total_value?: { value: unknown } }[] }>(
    `/v1.0/${id}/threads_insights`, token, { metric: "views,likes,replies,reposts,quotes", since: String(since), until: String(until) },
  );
  if (!Array.isArray(response.data)) throw new Error("Threads não retornou métricas válidas.");
  return { since: new Date(since * 1000).toISOString(), until: new Date(until * 1000).toISOString(),
    readAt: new Date().toISOString(), metrics: response.data.map(item => ({ name: item.name, period: item.period ?? null,
      values: (item.values ?? []).filter(value => typeof value.value === "number").map(value => ({ value: value.value as number, endTime: value.end_time ?? null })),
      total: typeof item.total_value?.value === "number" ? item.total_value.value : null })) };
}

export async function connectThreads(origin: string, code: string, organizationId: string, actorId: string) {
  const [appId, secret] = await etapaConexaoThreads("credentials", () => Promise.all([
    exigirCredencial("THREADS_APP_ID"), exigirCredencial("THREADS_APP_SECRET"),
  ]));
  const short = await etapaConexaoThreads("authorization_code", async () => {
    const result = await threadsRequest<{ access_token: string }>("/oauth/access_token", undefined, {
      client_id: appId, client_secret: secret, grant_type: "authorization_code", redirect_uri: threadsCallback(origin), code,
    }, "POST");
    if (!result.access_token) throw new Error("Threads não forneceu autorização.");
    return result;
  });
  const token = await etapaConexaoThreads("long_lived_token", async () => {
    const result = await threadsRequest<{ access_token: string; expires_in: number }>("/access_token", undefined,
      { grant_type: "th_exchange_token", client_secret: secret, access_token: short.access_token });
    if (!result.access_token || !Number.isFinite(result.expires_in) || result.expires_in <= 0) throw new Error("Threads retornou uma autorização sem validade.");
    return result;
  });
  const profile = await etapaConexaoThreads("profile", async () => {
    const result = await threadsRequest<{ id: string; username: string }>("/v1.0/me", token.access_token, { fields: "id,username" });
    if (!result.id || !result.username) throw new Error("Threads não retornou a conta autorizada.");
    return result;
  });
  const scopes = await etapaConexaoThreads("permissions", async () => {
    const result = await conferirPermissoesThreads(token.access_token, profile.id);
    if (!result.includes("threads_basic")) throw new Error("Acesso básico ao Threads não concedido.");
    return result;
  });
  const expiresAt = new Date(Date.now() + token.expires_in * 1000);
  const namespace = `threads:${appId}`;
  return etapaConexaoThreads("persistence", () => prisma.$transaction(async tx => {
    // Serialize ownership checks for the same remote account, including first login.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${namespace + ":" + profile.id}, 0))`;
    const other = await tx.organizationIntegrationConnection.findFirst({ where: {
      provider: THREADS_PROVIDER, externalId: profile.id, organizationId: { not: organizationId },
    }, select: { id: true } });
    if (other) throw new Error("Esta conta do Threads já está vinculada a outra empresa.");
    const data = { externalId: profile.id, accountName: profile.username, status: "ACTIVE", tokenCiphertext: cifrarToken(token.access_token),
      // Only scopes confirmed by token inspection are persisted as granted.
      tokenType: "bearer", tokenExpiresAt: expiresAt, scopes, lastSyncedAt: new Date(), lastSyncStatus: "CONNECTED",
      lastSyncError: null, metadata: { appId, requestedScopes: THREADS_SCOPES } };
    const legacy = await tx.organizationIntegrationConnection.upsert({ where: { organizationId_provider: { organizationId, provider: THREADS_PROVIDER } },
      create: { organizationId, provider: THREADS_PROVIDER, ...data }, update: data });
    const account = await tx.coreExternalAccount.upsert({ where: { provider_namespace_externalId: { provider: THREADS_PROVIDER, namespace, externalId: profile.id } },
      create: { provider: THREADS_PROVIDER, namespace, externalId: profile.id, displayName: profile.username }, update: { displayName: profile.username, observedAt: new Date() } });
    const authorization = { organizationId, externalAccountId: account.id, authorizedById: actorId, status: "AUTHORIZED", scopes,
      authorizedAt: new Date(), expiresAt, revokedAt: null };
    await tx.coreConnection.upsert({ where: { legacyConnectionId: legacy.id }, create: { ...authorization, legacyConnectionId: legacy.id }, update: authorization });
    await tx.operationsAuditEvent.create({ data: { actorId, organizationId, action: "THREADS_CONNECTED", entityType: "OrganizationIntegrationConnection", entityId: legacy.id } });
    return { username: profile.username };
  }));
}
