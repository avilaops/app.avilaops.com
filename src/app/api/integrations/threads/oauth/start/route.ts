import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { THREADS_STATE_COOKIE, threadsState, threadsLoginUrl } from "@/lib/threads";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const origin = process.env.APP_URL || "https://app.avilaops.com";
  const admin = await getAdmin();
  if (!admin) return NextResponse.redirect(new URL("/login", origin));
  const destination = new URL("/hub-social/meta", origin);
  const organizationId = request.nextUrl.searchParams.get("organizationId");
  try {
    if (!organizationId) throw new Error("Selecione uma empresa para conectar o Threads.");
    destination.searchParams.set("organizationId", organizationId);
    const organization = await prisma.organization.findFirst({ where: { id: organizationId, status: { not: "ARCHIVED" } }, select: { id: true } });
    if (!organization) throw new Error("Empresa não encontrada ou arquivada.");
    if (!process.env.META_TOKEN_ENCRYPTION_KEY) throw new Error("A configuração segura da conexão está pendente.");
    const state = threadsState(organizationId, admin.id);
    const url = await threadsLoginUrl(origin, state);
    (await cookies()).set(THREADS_STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
    return NextResponse.redirect(url);
  } catch {
    destination.searchParams.set("error", "Não foi possível iniciar o Threads. Confira a empresa selecionada e a configuração da integração.");
    return NextResponse.redirect(destination);
  }
}
