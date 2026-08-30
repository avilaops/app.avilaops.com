import { timingSafeEqual } from "crypto";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

/**
 * Autenticação para chamadas máquina-a-máquina (Worker de leads, TagFlow) —
 * distinta da sessão de admin por cookie usada no painel. JWT de curta
 * duração, assinado com um segredo compartilhado.
 */
export function verifyServiceJwt(request: NextRequest): { iss: string } | null {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const secret = process.env.SERVICE_JWT_SECRET;
  if (!token || !secret) return null;

  try {
    return jwt.verify(token, secret, { algorithms: ["HS256"] }) as { iss: string };
  } catch {
    return null;
  }
}

/**
 * Chamada de serviço: JWT de serviço **ou** o header `x-service-key` com o
 * segredo inteiro (é o que o n8n manda — credencial "Ávila OS Service Key").
 * Comparação em tempo constante; sem segredo configurado, nada passa.
 */
export function isServiceCall(request: NextRequest): boolean {
  if (verifyServiceJwt(request)) return true;

  const secret = process.env.SERVICE_JWT_SECRET;
  const key = request.headers.get("x-service-key") ?? "";
  if (!secret || !key) return false;

  const a = Buffer.from(key);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
