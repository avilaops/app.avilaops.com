import { NextRequest, NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { normalizarPagamento } from "@/lib/mercadopago";
import { isServiceCall } from "@/lib/service-auth";
import { gravarPagamentosMercadoPago } from "@/lib/sync-mercadopago";

export const runtime = "nodejs";

/**
 * Recebe do n8n os pagamentos de uma conta do Mercado Pago que não é a do
 * token do app, e grava no extrato.
 *
 * Motivo: a conta que cobra as lojas (token no `.env` do app) não é a conta
 * com o histórico da casa, a do CNPJ 67.954.417. O token dessa segunda conta
 * mora só no cofre do n8n; o fluxo "Ávila OS — Mercado Pago · Extrato da
 * conta CNPJ" lê `/users/me` e `/v1/payments/search` lá e manda o JSON cru
 * para cá. A regra de leitura (venda x compra, estorno, escopo) continua num
 * lugar só, `sync-mercadopago.ts`.
 *
 * Corpo: `{ conta: { id, nome, usuarioId, apelido? }, days?, pagamentos: [...] }`,
 * com `pagamentos` no formato da API do Mercado Pago.
 */
const ID_PERMITIDO = /^mercadopago-[a-z0-9-]{2,40}$/;

export async function POST(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin && !isServiceCall(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (admin && !ehDono(admin.role)) {
    return NextResponse.json({ error: "Só o dono da conta pode isto." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    conta?: { id?: unknown; nome?: unknown; usuarioId?: unknown; apelido?: unknown };
    days?: unknown;
    pagamentos?: unknown;
  } | null;

  const contaId = typeof body?.conta?.id === "string" ? body.conta.id.trim() : "";
  const nome = typeof body?.conta?.nome === "string" ? body.conta.nome.trim().slice(0, 80) : "";
  const usuarioId = Number(body?.conta?.usuarioId);
  const apelido = typeof body?.conta?.apelido === "string" ? body.conta.apelido.trim().slice(0, 60) : "";
  const days =
    typeof body?.days === "number" && Number.isFinite(body.days)
      ? Math.max(1, Math.min(3650, Math.trunc(body.days)))
      : 365;

  if (!ID_PERMITIDO.test(contaId) || contaId === "mercadopago-production") {
    return NextResponse.json(
      { error: "conta.id deve ser 'mercadopago-<apelido>' e não pode ser a conta do token do app." },
      { status: 400 },
    );
  }
  if (!nome) return NextResponse.json({ error: "conta.nome é obrigatório." }, { status: 400 });
  if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
    return NextResponse.json(
      { error: "conta.usuarioId (id de /users/me) é obrigatório: sem ele não se sabe se a conta pagou ou recebeu." },
      { status: 400 },
    );
  }
  if (!Array.isArray(body?.pagamentos)) {
    return NextResponse.json({ error: "pagamentos deve ser uma lista." }, { status: 400 });
  }
  if (body.pagamentos.length > 5000) {
    return NextResponse.json({ error: "No máximo 5.000 pagamentos por chamada." }, { status: 400 });
  }

  const pagamentos = (body.pagamentos as unknown[])
    .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === "object")
    .map(normalizarPagamento)
    .filter((p) => p.id > 0);

  try {
    const result = await gravarPagamentosMercadoPago({
      conta: { id: contaId, usuarioId, displayName: nome, externalId: apelido || String(usuarioId) },
      pagamentos,
      days,
      actorId: admin?.id ?? "servico:n8n",
    });
    return NextResponse.json({ ...result, recebidos: body.pagamentos.length, validos: pagamentos.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível gravar os pagamentos." },
      { status: 502 },
    );
  }
}
