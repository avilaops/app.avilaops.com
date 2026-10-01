import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { THREADS_STATE_COOKIE, parseThreadsState, connectThreads } from "@/lib/threads";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const origin = process.env.APP_URL || "https://app.avilaops.com";
  const admin = await getAdmin();
  if (!admin) return NextResponse.redirect(new URL("/login", origin));
  const destination = new URL("/hub-social/meta", origin);
  const state = request.nextUrl.searchParams.get("state");
  const store = await cookies();
  const expected = store.get(THREADS_STATE_COOKIE)?.value;
  store.delete(THREADS_STATE_COOKIE);
  const parsed = parseThreadsState(state);
  if (!expected || state !== expected || !parsed || parsed.actorId !== admin.id) {
    destination.searchParams.set("error", "Retorno do Threads inválido ou expirado. Conecte novamente.");
    return NextResponse.redirect(destination);
  }
  destination.searchParams.set("organizationId", parsed.organizationId);
  const code = request.nextUrl.searchParams.get("code");
  if (request.nextUrl.searchParams.has("error") || !code) {
    destination.searchParams.set("error", "A autorização do Threads não foi concluída.");
    return NextResponse.redirect(destination);
  }
  try {
    const organization = await prisma.organization.findFirst({ where: { id: parsed.organizationId, status: { not: "ARCHIVED" } }, select: { id: true } });
    if (!organization) throw new Error("Empresa indisponível.");
    await connectThreads(origin, code, parsed.organizationId, admin.id);
    destination.searchParams.set("threads", "1");
  } catch {
    destination.searchParams.set("error", "Não foi possível vincular o Threads. Confira a autorização e se a conta já pertence a outra empresa.");
  }
  return NextResponse.redirect(destination);
}
