import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import {
  decodeMetaOAuthState,
  exchangeMetaCode,
  META_STATE_COOKIE,
  saveMetaConnection,
  syncMetaBusiness,
} from "@/lib/meta";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const appUrl = process.env.APP_URL || "https://app.avilaops.com";
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.redirect(new URL("/login", appUrl));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error_description") || url.searchParams.get("error");
  const store = await cookies();
  const expectedState = store.get(META_STATE_COOKIE)?.value;
  store.delete(META_STATE_COOKIE);

  const redirectUrl = new URL("/hub-social/meta", appUrl);

  if (error) {
    redirectUrl.searchParams.set("error", error);
    return NextResponse.redirect(redirectUrl);
  }

  const decodedState = decodeMetaOAuthState(state);
  if (!code || !state || !expectedState || state !== expectedState || !decodedState) {
    redirectUrl.searchParams.set("error", "Retorno OAuth inválido ou expirado.");
    return NextResponse.redirect(redirectUrl);
  }
  redirectUrl.searchParams.set("organizationId", decodedState.organizationId);

  try {
    const token = await exchangeMetaCode(appUrl, code);
    await saveMetaConnection({
      actorId: admin.id,
      organizationId: decodedState.organizationId,
      ...token,
    });
    await syncMetaBusiness(admin.id, decodedState.organizationId);

    redirectUrl.searchParams.set("connected", "1");
    return NextResponse.redirect(redirectUrl);
  } catch (e) {
    redirectUrl.searchParams.set(
      "error",
      e instanceof Error ? e.message : "Falha ao conectar Meta Business.",
    );
    return NextResponse.redirect(redirectUrl);
  }
}
