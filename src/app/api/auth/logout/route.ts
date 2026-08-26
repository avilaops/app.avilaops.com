import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clearAdminSession, getAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NOME_COOKIE_SSO, urlLoginSSO } from "@/lib/sso";

/**
 * Logout derruba as duas sessões: a local (`avila_ops_session`) e a do SSO
 * (`avila_sso`, cookie de `.avilaops.com`). Apagar só a local deixaria a
 * pessoa "deslogada" por um instante e logada de novo no próximo request,
 * porque o cookie do SSO continuaria chegando.
 */
export async function POST(request: Request) {
  const admin = await getAdmin();
  if (admin) {
    await prisma.financeAuditEvent.create({
      data: {
        actorId: admin.id,
        action: "ADMIN_LOGOUT",
        entityType: "Session",
      },
    });
  }
  await clearAdminSession();

  const ssoLigado = Boolean(process.env.SSO_JWT_SECRET);
  if (ssoLigado) {
    const store = await cookies();
    // Mesmo domínio da escrita no auth server; host-only não apaga cookie de domínio pai.
    store.delete({ name: NOME_COOKIE_SSO, path: "/", domain: process.env.SSO_COOKIE_DOMAIN || ".avilaops.com" });
    return NextResponse.redirect(urlLoginSSO(), 303);
  }

  return NextResponse.redirect(new URL("/login", request.url), 303);
}
