type ErpIssuance = { id: string; externalId: string; status: string; revision: string | number; accessKey?: string; reason?: string };

export class ErpNfseErro extends Error {
  constructor(message: string, readonly uncertain = false, readonly status?: number) { super(message); }
}

function config() {
  const baseUrl = process.env.ERP_NFSE_URL?.trim().replace(/\/$/, "");
  const serviceKey = process.env.ERP_SERVICE_KEY?.trim();
  const tenantId = process.env.ERP_TENANT_ID?.trim();
  if (!baseUrl || !serviceKey || !tenantId) throw new ErpNfseErro("Integração fiscal com o ERP não configurada.");
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost" && url.hostname !== "api") throw new ErpNfseErro("A URL do ERP deve usar HTTPS.");
  return { baseUrl, serviceKey, tenantId };
}

async function request(path: string, init: RequestInit, timeoutMs = 15_000) {
  const { baseUrl, serviceKey, tenantId } = config();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, { ...init, signal: controller.signal, headers: { authorization: `Bearer ${serviceKey}`, "x-tenant-id": tenantId, accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers }, cache: "no-store" });
    const body = await response.json().catch(() => null) as { data?: unknown; error?: string; message?: string; title?: string } | null;
    if (!response.ok) throw new ErpNfseErro((body?.error || body?.message || body?.title || `ERP respondeu HTTP ${response.status}.`).slice(0, 500), response.status >= 500, response.status);
    if (!body || typeof body.data !== "object" || body.data === null) throw new ErpNfseErro("Resposta fiscal inválida do ERP.", true);
    return body.data as ErpIssuance;
  } catch (error) {
    if (error instanceof ErpNfseErro) throw error;
    throw new ErpNfseErro(error instanceof Error && error.name === "AbortError" ? "Tempo limite ao chamar o ERP." : "Não foi possível confirmar a resposta do ERP.", true);
  } finally { clearTimeout(timer); }
}

export async function emitirNfseNoErp(input: { idempotencyKey: string; externalId: string; competenceDate: string; amount: string; serviceCode: string; description: string; customer: { name: string; taxId: string; email?: string } }) {
  return request("/api/v1/integrations/nfse/issuances", { method: "POST", headers: { "idempotency-key": input.idempotencyKey }, body: JSON.stringify({ externalId: input.externalId, environment: "homologation", competenceDate: input.competenceDate, amount: input.amount, serviceCode: input.serviceCode, description: input.description, customer: input.customer }) });
}

export const consultarNfseNoErp = (id: string) => request(`/api/v1/integrations/nfse/issuances/${encodeURIComponent(id)}`, { method: "GET" });
export const reconciliarNfseNoErp = (id: string, idempotencyKey: string) => request(`/api/v1/integrations/nfse/issuances/${encodeURIComponent(id)}/reconcile`, { method: "POST", headers: { "idempotency-key": idempotencyKey }, body: "{}" });
export const cancelarNfseNoErp = (id: string, idempotencyKey: string, reason: string) => request(`/api/v1/integrations/nfse/issuances/${encodeURIComponent(id)}/cancel`, { method: "POST", headers: { "idempotency-key": idempotencyKey }, body: JSON.stringify({ reason }) });

export async function baixarXmlNfseDoErp(id: string) {
  const { baseUrl, serviceKey, tenantId } = config();
  const response = await fetch(`${baseUrl}/api/v1/integrations/nfse/issuances/${encodeURIComponent(id)}/xml`, { headers: { authorization: `Bearer ${serviceKey}`, "x-tenant-id": tenantId }, cache: "no-store" });
  if (!response.ok) throw new ErpNfseErro(`ERP respondeu HTTP ${response.status}.`, response.status >= 500, response.status);
  return response.text();
}
