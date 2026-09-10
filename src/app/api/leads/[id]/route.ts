import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { cleanText, sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";

/**
 * Mover o lead de estágio, da tela /leads.
 *
 * É a única escrita que a tela faz: um lead ou avança no funil ou é perdido, e
 * quem qualifica é quem falou com a pessoa. Editar empresa e telefone não entra
 * aqui de propósito — o dado veio do formulário do site e reescrever à mão o
 * que o cliente digitou esconde o que ele realmente pediu.
 */

/**
 * Os seis estágios são os do banco, não uma lista inventada aqui: a tabela tem
 * `leads_stage_check` desde a migração inicial e recusa qualquer outro valor
 * com erro 500. Mexer nesta lista sem mexer no CHECK quebra a tela.
 */
const ESTAGIOS = ["NEW", "QUALIFIED", "DIAGNOSIS", "PROPOSAL", "WON", "LOST"] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const stage = cleanText(body?.stage, 32).toUpperCase();

  if (!ESTAGIOS.includes(stage as (typeof ESTAGIOS)[number])) {
    return NextResponse.json({ error: "Estágio inválido." }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({ where: { id }, select: { id: true, stage: true } });
  if (!lead) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

  const atualizado = await prisma.lead.update({
    where: { id },
    data: {
      stage,
      // Lead fechado não tem próxima ação: deixar a data marcada faria a lista
      // continuar cobrando quem já foi ganho ou perdido.
      nextActionAt: stage === "WON" || stage === "LOST" ? null : undefined,
    },
    select: { id: true, stage: true },
  });

  await prisma.operationsAuditEvent.create({
    data: {
      action: "LEAD_STAGE_CHANGED",
      entityType: "Lead",
      entityId: lead.id,
      actorId: admin.id,
      metadata: { de: lead.stage, para: atualizado.stage },
    },
  });

  return NextResponse.json({ ok: true, stage: atualizado.stage });
}
