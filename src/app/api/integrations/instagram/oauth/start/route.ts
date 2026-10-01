import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  INSTAGRAM_STATE_COOKIE,
  codificarEstadoInstagram,
  montarUrlDeLoginInstagram,
} from "@/lib/instagram";

export const runtime = "nodejs";

/**
 * Manda o cliente para o consentimento do Instagram.
 *
 * O cookie de estado é o que faz a volta ser confiável: sem ele, qualquer um
 * poderia chamar o callback com um código e amarrar uma conta de Instagram a um
 * cliente que não é dele.
 */
export async function GET(request: NextRequest) {
  const appUrl = process.env.APP_URL || new URL(request.url).origin;
  const admin = await getAdmin();
  if (!admin) return NextResponse.redirect(new URL("/login", appUrl));

  const destino = new URL("/hub-social/meta", appUrl);

  try {
    const organizationId = new URL(request.url).searchParams.get("organizationId");
    if (!organizationId) {
      destino.searchParams.set("error", "Selecione um cliente antes de conectar o Instagram.");
      return NextResponse.redirect(destino);
    }

    destino.searchParams.set("organizationId", organizationId);
    const organization = await prisma.organization.findFirst({ where: { id: organizationId, status: { not: "ARCHIVED" } }, select: { id: true } });
    if (!organization) throw new Error("Empresa não encontrada ou arquivada.");
    const state = codificarEstadoInstagram(organizationId, admin.id);
    const store = await cookies();
    store.set(INSTAGRAM_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 10 * 60,
    });

    return NextResponse.redirect(await montarUrlDeLoginInstagram(appUrl, state));
  } catch (erro) {
    destino.searchParams.set(
      "error",
      erro instanceof Error ? erro.message : "Configuração do Instagram incompleta.",
    );
    return NextResponse.redirect(destino);
  }
}
