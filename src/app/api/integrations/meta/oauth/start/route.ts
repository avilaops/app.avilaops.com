import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import {
  buildMetaLoginUrl,
  encodeMetaOAuthState,
  META_STATE_COOKIE,
} from "@/lib/meta";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const appUrl = process.env.APP_URL || new URL(request.url).origin;
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.redirect(new URL("/login", appUrl));
  }

  try {
    const organizationId = new URL(request.url).searchParams.get("organizationId");
    if (!organizationId) {
      const url = new URL("/hub-social/meta", appUrl);
      url.searchParams.set("error", "Selecione um cliente antes de conectar a Meta.");
      return NextResponse.redirect(url);
    }

    const state = encodeMetaOAuthState(organizationId);
    const store = await cookies();
    store.set(META_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 10 * 60,
    });

    return NextResponse.redirect(await buildMetaLoginUrl(appUrl, state));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Configuração Meta incompleta.";
    const url = new URL("/hub-social/meta", appUrl);
    url.searchParams.set("error", message);
    return NextResponse.redirect(url);
  }
}
