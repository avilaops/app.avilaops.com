import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import {
  OrganizacaoNaoEncontradaError,
  decidirSugestoes,
  montarPainel,
} from "@/lib/cadastro-ia/assistente";

/**
 * Decisão humana sobre as sugestões: o único caminho pelo qual uma proposta
 * do assistente vira dado gravado na ficha do cliente. Quem aprovou e quando
 * ficam no registro da sugestão e num evento de auditoria.
 */

function listaDeIds(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= 64)
    .slice(0, 40);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    aprovadas?: unknown;
    descartadas?: unknown;
  } | null;

  const aprovadas = listaDeIds(body?.aprovadas);
  const descartadas = listaDeIds(body?.descartadas);

  if (aprovadas.length === 0 && descartadas.length === 0) {
    return NextResponse.json({ error: "Nenhuma sugestão selecionada." }, { status: 400 });
  }

  try {
    const resumo = await decidirSugestoes(id, admin.id, aprovadas, descartadas);
    return NextResponse.json({ status: "SUCCESS", ...resumo, painel: await montarPainel(id) });
  } catch (error) {
    if (error instanceof OrganizacaoNaoEncontradaError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
