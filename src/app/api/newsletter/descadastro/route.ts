import { NextRequest, NextResponse } from "next/server";
import { unsubscribeByEmail, verifyUnsubscribeToken } from "@/lib/newsletter";

/**
 * Rota pública: quem chega aqui não tem sessão, tem o token assinado do
 * rodapé do e-mail. Aceita tanto o botão da página (formulário) quanto o
 * POST automático do "List-Unsubscribe-Post" dos provedores (RFC 8058).
 */
export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  let token: string | null = null;

  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    token = typeof form.get("token") === "string" ? String(form.get("token")) : null;
    if (!token) token = request.nextUrl.searchParams.get("token");
  } else {
    token = request.nextUrl.searchParams.get("token");
    if (!token) {
      const body = (await request.json().catch(() => null)) as { token?: string } | null;
      token = body?.token ?? null;
    }
  }

  const email = verifyUnsubscribeToken(token);
  const oneClick = !contentType.includes("multipart/form-data") && !request.headers.get("referer");

  if (!email) {
    if (oneClick) return NextResponse.json({ error: "invalid_token" }, { status: 404 });
    return NextResponse.redirect(new URL("/newsletter/descadastro", request.url), 303);
  }

  await unsubscribeByEmail(email, "link");

  if (oneClick && !contentType.includes("application/x-www-form-urlencoded")) {
    return NextResponse.json({ unsubscribed: true });
  }

  const redirectTo = new URL("/newsletter/descadastro", request.url);
  redirectTo.searchParams.set("token", token ?? "");
  redirectTo.searchParams.set("ok", "1");
  return NextResponse.redirect(redirectTo, 303);
}
