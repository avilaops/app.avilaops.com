import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { htmlDaPeca, type Snapshot } from "@/lib/estudio/servidor";

/**
 * A página que o worker abre no Chromium. Sem cookie: o token de 128 bits nasce
 * com o pedido e só o worker o recebe. Serve o pedido congelado, não a peça atual.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const render = await prisma.studioRender.findUnique({ where: { id } });
  if (!render) return new NextResponse("não encontrado", { status: 404 });
  const s = render.snapshot as unknown as Snapshot;
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const a = Buffer.from(token);
  const b = Buffer.from(s.token ?? "");
  if (!a.length || a.length !== b.length || !timingSafeEqual(a, b)) return new NextResponse("proibido", { status: 403 });

  const html = htmlDaPeca({ templateId: s.templateId, formato: s.formato, valores: s.valores, duracao: s.duracao, marca: s.marca });
  if (!html) return new NextResponse("template desconhecido", { status: 410 });
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
