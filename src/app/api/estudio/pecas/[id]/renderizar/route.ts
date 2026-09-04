import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { montarSnapshot, obterPeca, renderParaDTO } from "@/lib/estudio/servidor";

/** Põe a peça na fila. O worker (estudio-worker/) pega pelo GET /api/estudio/fila. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  const { id } = await params;
  const peca = await obterPeca(id);
  if (!peca) return NextResponse.json({ error: "Peça não encontrada." }, { status: 404 });

  const aberta = peca.renders.find((r) => r.status === "PENDING" || r.status === "RUNNING");
  if (aberta) return NextResponse.json({ error: "Já existe uma renderização em andamento para esta peça.", render: aberta }, { status: 409 });

  const { snapshot, kind, largura, altura, duracao } = montarSnapshot(peca);
  const render = await prisma.studioRender.create({
    data: { pieceId: peca.id, kind, width: largura, height: altura, fps: 24, duration: duracao, snapshot },
  });
  return NextResponse.json({ render: renderParaDTO(render) }, { status: 201 });
}
