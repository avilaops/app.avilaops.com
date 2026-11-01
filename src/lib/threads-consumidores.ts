import { createHash, timingSafeEqual } from "node:crypto";

/** Explicit server configuration; the consumer cannot choose an organization. */
export function empresaThreadsDoCrm(authorization: string | null, tenant: string | null): string | null {
  const secret = process.env.CRM_THREADS_API_TOKEN;
  if (!secret || secret.length < 32 || !authorization?.startsWith("Bearer ") || !tenant || tenant.length > 100) return null;
  const hash = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(hash(secret), hash(authorization.slice(7)))) return null;
  try {
    const mapping: unknown = JSON.parse(process.env.CRM_THREADS_TENANT_MAP || "{}");
    if (!mapping || typeof mapping !== "object" || Array.isArray(mapping) || !Object.hasOwn(mapping, tenant)) return null;
    const id = (mapping as Record<string, unknown>)[tenant];
    return typeof id === "string" && /^[a-zA-Z0-9-]{1,100}$/.test(id) ? id : null;
  } catch { return null; }
}
