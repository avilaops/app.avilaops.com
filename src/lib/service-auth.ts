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
