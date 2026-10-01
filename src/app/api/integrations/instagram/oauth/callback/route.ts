import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  INSTAGRAM_STATE_COOKIE,
  decodificarEstadoInstagram,
  salvarConexaoInstagram,
  trocarCodigoInstagram,
} from "@/lib/instagram";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const appUrl = process.env.APP_URL || "https://app.avilaops.com";
  const admin = await getAdmin();
  if (!admin) return NextResponse.redirect(new URL("/login", appUrl));

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  // O Instagram devolve a recusa em `error_description`; o `error` sozinho vem
  // como "access_denied", que não diz nada para quem está olhando a tela.
  const erroRecebido =
    url.searchParams.get("error_description") || url.searchParams.get("error");

  const store = await cookies();
  const esperado = store.get(INSTAGRAM_STATE_COOKIE)?.value;
  store.delete(INSTAGRAM_STATE_COOKIE);

  const destino = new URL("/hub-social/meta", appUrl);
  const estado = decodificarEstadoInstagram(state);
  if (!state || !esperado || state !== esperado || !estado || estado.actorId !== admin.id) {
    destino.searchParams.set("error", "Retorno do Instagram inválido ou expirado.");
    return NextResponse.redirect(destino);
  }
  destino.searchParams.set("organizationId", estado.organizationId);

  if (erroRecebido) {
    destino.searchParams.set("error", erroRecebido);
    return NextResponse.redirect(destino);
  }

  if (!code || !state || !esperado || state !== esperado || !estado) {
    destino.searchParams.set("error", "Retorno do Instagram inválido ou expirado.");
    return NextResponse.redirect(destino);
  }
  destino.searchParams.set("organizationId", estado.organizationId);

  try {
    const organization = await prisma.organization.findFirst({ where: { id: estado.organizationId, status: { not: "ARCHIVED" } }, select: { id: true } });
    if (!organization) throw new Error("Empresa não encontrada ou arquivada.");
    const token = await trocarCodigoInstagram(appUrl, code);
    await salvarConexaoInstagram({
      actorId: admin.id,
      organizationId: estado.organizationId,
      ...token,
    });

    destino.searchParams.set("instagram", "1");
    return NextResponse.redirect(destino);
  } catch (erro) {
    destino.searchParams.set(
      "error",
      erro instanceof Error ? erro.message : "Falha ao conectar o Instagram.",
    );
    return NextResponse.redirect(destino);
  }
}
