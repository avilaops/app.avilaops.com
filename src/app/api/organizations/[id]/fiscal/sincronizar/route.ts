import { NextRequest, NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sincronizarNFeOrganizacao } from "@/lib/fiscal/sefaz-distribuicao";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!ehDono(admin.role)) {
    return NextResponse.json({ error: "Acesso restrito ao proprietário da conta." }, { status: 403 });
  }

  const { id } = await params;

  const organizacao = await prisma.organization.findUnique({
    where: { id },
    select: { id: true, legalName: true, cpfCnpj: true },
  });

  if (!organizacao) {
    return NextResponse.json({ error: "Organização não encontrada." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const ambiente = body.ambiente === "HOMOLOGACAO" ? "HOMOLOGACAO" : "PRODUCAO";
  const limiteIteracoes = typeof body.limiteIteracoes === "number" ? body.limiteIteracoes : 3;

  try {
    const resultado = await sincronizarNFeOrganizacao({
      organizationId: id,
      ambiente,
      limiteIteracoes,
    });

    await prisma.operationsAuditEvent.create({
      data: {
        action: "SEFAZ_DFE_SINCRONIZADO",
        entityType: "FiscalSync",
        entityId: id,
        organizationId: id,
        actorId: admin.id,
        metadata: {
          sucesso: resultado.sucesso,
          documentosEncontrados: resultado.documentosEncontrados,
          ultNSU: resultado.ultNSUFinal,
          maxNSU: resultado.maxNSU,
          bloqueioConsumoIndevido: resultado.bloqueioConsumoIndevido,
        },
      },
    });

    return NextResponse.json(resultado);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido ao sincronizar SEFAZ.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
