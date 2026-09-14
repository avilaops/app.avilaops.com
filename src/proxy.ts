import { NextRequest, NextResponse } from "next/server";

const HOST_CLIENTE = "cliente.avilaops.com";

export function proxy(request: NextRequest) {
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "")
    .split(":")[0]
    .toLowerCase();
  if (host !== HOST_CLIENTE) return NextResponse.next();

  if (request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/portal";
    return NextResponse.rewrite(url);
  }

  if (request.nextUrl.pathname.startsWith("/operacao") || request.nextUrl.pathname.startsWith("/financeiro")) {
    return NextResponse.redirect(new URL("/portal", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
