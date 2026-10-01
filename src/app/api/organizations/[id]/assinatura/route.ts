import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { criarContratacao } from "@/lib/nucleo/contratacao";
import { ehDono, getAdmin } from "@/lib/auth";
import { cleanText, sameOrigin } from "@/lib/http";
import { marcarEtapa } from "@/lib/onboarding-etapas";
import { prisma } from "@/lib/prisma";

function centsDeTexto(valor: unknown): number | null {
  const texto = cleanText(valor, 30).replace(/\./g, "").replace(",", ".");
  if (!texto) return null;
  const numero = Number(texto);
  if (!Number.isFinite(numero) || numero <= 0) return null;
  return Math.round(numero * 100);
}

/**
 * Nova assinatura do cliente, pela ficha. Substitui o
 * `scripts/criar-assinatura.ts`. Já nasce com a primeira fatura da recorrência
 * — mensal ou anual, conforme o ciclo — e, se houver implantação, com a fatura
 * SETUP vencendo em 7 dias, para ter o que cobrar no mesmo dia em que o
 * contrato fecha.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  // Dinheiro, segredo e acesso são do dono; a equipe para aqui.
  if (!ehDono(admin.role)) return NextResponse.json({ error: "Só o dono da conta pode isto." }, { status: 403 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const descricao = cleanText(body?.descricao, 160);
  const valorCents = centsDeTexto(body?.valor);
  const dia = Number(cleanText(body?.dia, 3));
  const inicioTexto = cleanText(body?.inicio, 10);
  const implantacaoCents = centsDeTexto(body?.implantacao);
  const produto = cleanText(body?.produto, 40) || null;
  const tenant = cleanText(body?.tenant, 80) || null;
  const ciclo = cleanText(body?.ciclo, 10).toUpperCase() || "MONTHLY";

  if (!descricao) return NextResponse.json({ error: "Informe a descrição da assinatura." }, { status: 400 });
  if (ciclo !== "MONTHLY" && ciclo !== "YEARLY") {
    return NextResponse.json({ error: "Ciclo inválido: use mensal ou anual." }, { status: 400 });
  }
  if (!valorCents) {
    return NextResponse.json(
      { error: `Informe um valor ${ciclo === "YEARLY" ? "anual" : "mensal"} maior que zero.` },
      { status: 400 },
    );
  }
  if (!Number.isInteger(dia) || dia < 1 || dia > 28) {
    return NextResponse.json({ error: "Dia de vencimento entre 1 e 28 - 29, 30 e 31 não existem em todo mês." }, { status: 400 });
  }
  if ((produto && !tenant) || (!produto && tenant)) {
    return NextResponse.json({ error: "Produto e tenant andam juntos: informe os dois ou nenhum." }, { status: 400 });
  }
  const inicio = /^\d{4}-\d{2}-\d{2}$/.test(inicioTexto) ? new Date(`${inicioTexto}T00:00:00Z`) : new Date();

  if (!Number.isFinite(inicio.getTime()) || (inicioTexto && inicio.toISOString().slice(0, 10) !== inicioTexto)) {
    return NextResponse.json({ error: "Informe uma data de início válida." }, { status: 400 });
  }

  const organizacao = await prisma.organization.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!organizacao) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

  if (produto && tenant) {
    const existente = await prisma.subscription.findUnique({
      where: { productKey_productTenantId: { productKey: produto, productTenantId: tenant } },
      select: { id: true, organizationId: true },
    });
    if (existente) {
      return NextResponse.json(
        { error: existente.organizationId === id ? "Este produto/tenant já tem assinatura neste cliente." : "Este produto/tenant já pertence a outro cliente." },
        { status: 409 },
      );
    }
  }

  try {
    const { assinatura, faturas } = await criarContratacao({
      organizationId: id, actorId: admin.id, descricao, valorCents, dia, ciclo,
      inicio, implantacaoCents, produto, tenant,
    });
    await marcarEtapa(id, "BILLING", `${descricao}: R$ ${(valorCents / 100).toFixed(2).replace(".", ",")}/${ciclo === "YEARLY" ? "ano" : "mês"}, dia ${dia}`);
    return NextResponse.json({
      ok: true, assinaturaId: assinatura.id,
      faturas: faturas.map(f => ({ id: f.id, tipo: f.kind, competencia: f.competence,
        vencimento: f.dueDate.toISOString().slice(0, 10), valorCents: Math.round(Number(f.amount) * 100) })),
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Este produto já possui assinatura. Atualize a ficha para conferir." }, { status: 409 });
    }
    console.error("[assinatura] falha ao registrar contratação", error);
    return NextResponse.json({ error: "Não foi possível registrar a contratação. Nenhuma alteração parcial foi salva." }, { status: 500 });
  }
}
