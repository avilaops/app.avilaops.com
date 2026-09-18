import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { cleanText, sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { FORMATOS, obterPeca, saneiaTrilha, saneiaValores } from "@/lib/estudio/servidor";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Ctx) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const { id } = await params;
  const peca = await obterPeca(id);
  if (!peca) return NextResponse.json({ error: "Peça não encontrada." }, { status: 404 });
  return NextResponse.json({ peca });
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  const { id } = await params;
  const atual = await prisma.studioPiece.findUnique({ where: { id } });
  if (!atual) return NextResponse.json({ error: "Peça não encontrada." }, { status: 404 });

  const corpo = await request.json().catch(() => ({}));
  const dados: Record<string, unknown> = {};
  if (typeof corpo.titulo === "string") dados.title = cleanText(corpo.titulo, 120) || atual.title;
  // `null` devolve a peça para a casa; string troca de dono.
  if (corpo.organizationId !== undefined) {
    const alvo = cleanText(corpo.organizationId, 40) || null;
    if (alvo) {
      const existe = await prisma.organization.findUnique({ where: { id: alvo }, select: { id: true } });
      if (!existe) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 400 });
    }
    dados.organizationId = alvo;
  }
  if (FORMATOS.includes(corpo.formato)) dados.format = corpo.formato;
  if (corpo.valores !== undefined) dados.values = saneiaValores(atual.templateId, corpo.valores);
  if (corpo.duracao !== undefined) {
    const d = Number(corpo.duracao);
    dados.duration = Number.isFinite(d) ? Math.min(60, Math.max(1, d)) : atual.duration;
  }
  if (typeof corpo.narracao === "boolean") dados.narration = corpo.narracao;
  if (typeof corpo.voz === "string" && /^[a-z]{2}_[a-z]+$/.test(corpo.voz)) dados.voice = corpo.voz;
  if (corpo.trilha !== undefined) {
    const t = saneiaTrilha(corpo.trilha);
    dados.soundtrack = t === null ? null : t;
  }

  await prisma.studioPiece.update({ where: { id }, data: dados });
  return NextResponse.json({ peca: await obterPeca(id) });
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  const { id } = await params;
  await prisma.studioPiece.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
