import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

/**
 * Leitura da sessão emitida por `auth.avilaops.com`.
 *
 * O cookie é gravado lá em `.avilaops.com` e chega aqui sozinho. Verificamos a
 * assinatura localmente com o segredo compartilhado — sem round-trip por
 * request.
 */

const COOKIE_SSO = "avila_sso";

export type SessaoSSO = {
  sub: string;
  email: string;
  nome: string;
  foto: string | null;
  papel: "ADMIN" | "CLIENTE";
};

export function ssoBaseUrl(): string {
  return process.env.SSO_BASE_URL || "https://auth.avilaops.com";
}

/** URL de login deste app no SSO. */
export function urlLoginSSO(returnTo = "https://app.avilaops.com/operacao"): string {
  const p = new URLSearchParams({ app: "app", returnTo });
  return `${ssoBaseUrl()}/login?${p.toString()}`;
}

export async function lerSessaoSSO(): Promise<SessaoSSO | null> {
  const segredo = process.env.SSO_JWT_SECRET;
  // Sem o segredo configurado o SSO simplesmente não está ligado neste ambiente.
  // Não é erro: o login local por CPF/senha continua atendendo.
  if (!segredo) return null;

  const token = (await cookies()).get(COOKIE_SSO)?.value;
  if (!token) return null;

  try {
    return jwt.verify(token, segredo, { issuer: "auth.avilaops.com" }) as SessaoSSO;
  } catch {
    return null;
  }
}

export const NOME_COOKIE_SSO = COOKIE_SSO;
