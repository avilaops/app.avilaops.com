import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { cleanText, sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { templatePorId, valoresPadrao } from "@/lib/estudio/templates";
import { FORMATOS, listarPecas, paraDTO, saneiaValores } from "@/lib/estudio/servidor";
import { TRILHA_PADRAO } from "@/lib/estudio/tipos";

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  return NextResponse.json({ pecas: await listarPecas() });
}

/** Cria a peça já com os valores padrão do template; a edição vem depois, na tela. */
export async function POST(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  const corpo = await request.json().catch(() => ({}));
  const template = templatePorId(cleanText(corpo.templateId, 60));
  if (!template) return NextResponse.json({ error: "Escolha um template." }, { status: 400 });
  const formato = FORMATOS.includes(corpo.formato) ? corpo.formato : "9:16";
  const titulo = cleanText(corpo.titulo, 120) || template.nome;

  // Cliente é opcional: sem ele a peça é da casa. Com ele, confere que existe
  // antes de gravar — id inventado viraria peça órfã com marca padrão calada.
  const organizationId = cleanText(corpo.organizationId, 40) || null;
  if (organizationId) {
    const existe = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
    if (!existe) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 400 });
  }

  const peca = await prisma.studioPiece.create({
    data: {
      title: titulo,
      organizationId,
      templateId: template.id,
      format: formato,
      values: corpo.valores ? saneiaValores(template.id, corpo.valores) : valoresPadrao(template),
      duration: template.tipo === "video" ? template.duracaoPadrao ?? 5 : null,
      narration: template.tipo === "video",
      soundtrack: template.tipo === "video" ? TRILHA_PADRAO : undefined,
      createdBy: admin.email,
    },
    include: { renders: true, organization: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ peca: paraDTO(peca) }, { status: 201 });
}
