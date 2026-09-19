/**
 * O que as três rotas de ação das telas têm em comum.
 *
 * Elas são finas de propósito: quem decide se um comando pode sair é o agente
 * (janela silenciosa, allowlist de origem, TTL de 60 s), e repetir essas
 * regras aqui criaria uma segunda verdade que um dia discorda da primeira.
 * O que é desta camada: quem é o operador, se o pedido veio da própria tela e
 * deixar rastro do que foi feito.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdmin, type AdminAtual } from "@/lib/auth";
import { AgenteIndisponivel, agenteConfigurado } from "@/lib/avila-tv";
import { sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/** Nega antes de qualquer trabalho; devolve o operador quando pode seguir. */
export async function operadorOuRecusa(request: NextRequest): Promise<AdminAtual | NextResponse> {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  if (!agenteConfigurado()) {
    return NextResponse.json({ error: "AVILA_TV_API_KEY não configurada neste ambiente." }, { status: 503 });
  }
  return admin;
}

export function ehResposta(v: AdminAtual | NextResponse): v is NextResponse {
  return v instanceof NextResponse;
}

/**
 * Traduz a falha para quem está olhando a tela.
 *
 * O agente fora do ar é 503 e não 500: é o estado normal de um agente que
 * mora num PC de casa, e quem chamou precisa saber que o problema não é o
 * pedido dele. O código do protocolo (`janela_silenciosa_22h_07h`,
 * `origem_nao_autorizada`) volta em `erro` para a tela poder explicar.
 */
export function falha(erro: unknown): NextResponse {
  if (erro instanceof AgenteIndisponivel) {
    return NextResponse.json({ error: erro.message }, { status: 503 });
  }
  const e = erro instanceof Error ? erro : new Error(String(erro));
  return NextResponse.json({ error: e.message, erro: e.name !== "Error" ? e.name : undefined }, { status: 409 });
}

/**
 * Registra o que foi feito com uma tela.
 *
 * O agente já loga o comando no PC; isto é o outro lado da mesma história —
 * *quem* mandou, a partir deste painel. Sem isso, "quem revogou a tela da
 * cozinha?" não tem resposta depois que o log do agente rotaciona.
 */
export async function anotar(admin: AdminAtual, action: string, entityId: string, metadata: Record<string, unknown>) {
  await prisma.operationsAuditEvent.create({
    data: { action, entityType: "AvilaTvScreen", entityId, actorId: admin.id, metadata: metadata as Prisma.InputJsonValue },
  });
}
