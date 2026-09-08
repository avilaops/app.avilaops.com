import { NextRequest, NextResponse } from "next/server";
import { garantirFatura, recorrenteDe } from "@/lib/assinaturas";
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

function competenciaDe(data: Date) {
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}`;
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
    return NextResponse.json({ error: "Dia de vencimento entre 1 e 28 — 29, 30 e 31 não existem em todo mês." }, { status: 400 });
  }
  if ((produto && !tenant) || (!produto && tenant)) {
    return NextResponse.json({ error: "Produto e tenant andam juntos: informe os dois ou nenhum." }, { status: 400 });
  }
  const inicio = /^\d{4}-\d{2}-\d{2}$/.test(inicioTexto) ? new Date(`${inicioTexto}T00:00:00Z`) : new Date();

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

  const assinatura = await prisma.subscription.create({
    data: {
      organizationId: id,
      description: descricao,
      amount: valorCents / 100,
      billingDay: dia,
      billingCycle: ciclo,
      startedAt: inicio,
      status: "ACTIVE",
      productKey: produto,
      productTenantId: tenant,
    },
  });

  // Primeira fatura da recorrência: vence no dia escolhido do mês de início; se
  // esse dia já passou, em 7 dias — nunca com vencimento no passado. No ciclo
  // anual é a mesma conta: a próxima só volta doze meses depois.
  const competencia = competenciaDe(inicio);
  const [ano, mes] = competencia.split("-").map(Number);
  const vencimentoNoMes = new Date(Date.UTC(ano, mes - 1, dia));
  const emSeteDias = new Date(Date.now() + 7 * 86_400_000);
  const mensal = await garantirFatura({
    subscriptionId: assinatura.id,
    competencia,
    tipo: recorrenteDe(ciclo),
    vencimento: vencimentoNoMes < new Date() ? emSeteDias : vencimentoNoMes,
  });

  const setup = implantacaoCents
    ? await garantirFatura({
        subscriptionId: assinatura.id,
        competencia,
        tipo: "SETUP",
        valorCents: implantacaoCents,
        vencimento: emSeteDias,
      })
    : null;

  await marcarEtapa(
    id,
    "BILLING",
    `${descricao}: R$ ${(valorCents / 100).toFixed(2).replace(".", ",")}/${ciclo === "YEARLY" ? "ano" : "mês"}, dia ${dia}`,
  );

  await prisma.operationsAuditEvent.create({
    data: {
      action: "SUBSCRIPTION_CREATED",
      entityType: "Subscription",
      entityId: assinatura.id,
      organizationId: id,
      actorId: admin.id,
      metadata: { descricao, valorCents, dia, ciclo, inicio: inicio.toISOString().slice(0, 10), implantacaoCents, produto, tenant, faturaMensal: mensal?.id ?? null, faturaSetup: setup?.id ?? null },
    },
  });

  return NextResponse.json({
    ok: true,
    assinaturaId: assinatura.id,
    faturas: [mensal, setup].filter(Boolean).map((f) => ({ id: f!.id, tipo: f!.kind, competencia: f!.competence, vencimento: f!.dueDate.toISOString().slice(0, 10), valorCents: Math.round(Number(f!.amount.toString()) * 100) })),
  });
}
