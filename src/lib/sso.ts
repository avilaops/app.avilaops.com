import { cookies } from "next/headers";

/**
 * Leitura da sessão emitida por `auth.avilaops.com`.
 *
 * O cookie é gravado lá em `.avilaops.com` e chega aqui sozinho. A validade e
 * a autorização são decididas pelo Auth; este app não replica a assinatura.
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

export function urlLogoutSSO(returnTo = "https://app.avilaops.com/"): string {
  const p = new URLSearchParams({ client_id: "app", post_logout_redirect_uri: returnTo });
  return `${ssoBaseUrl()}/api/auth/logout?${p.toString()}`;
}

export async function lerSessaoSSO(): Promise<SessaoSSO | null> {
  const token = (await cookies()).get(COOKIE_SSO)?.value;
  if (!token) return null;

  try {
    const resposta = await fetch(`${ssoBaseUrl()}/api/session?app=app`, {
      headers: { Cookie: `${COOKIE_SSO}=${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!resposta.ok) return null;
    const corpo = await resposta.json() as { autenticado?: boolean; permitido?: boolean; sessao?: SessaoSSO };
    return corpo.autenticado && corpo.permitido && corpo.sessao?.sub && corpo.sessao.email ? corpo.sessao : null;
  } catch {
    return null;
  }
}

export const NOME_COOKIE_SSO = COOKIE_SSO;
