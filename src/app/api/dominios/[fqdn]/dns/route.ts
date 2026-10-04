import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { ErroDeDns, executarOperacaoDns, lerOperacaoDns } from "@/lib/dominios/dns/escrita";
import { sameOrigin } from "@/lib/http";

export const runtime = "nodejs";

/**
 * Escrita de DNS de um domínio pela equipe: criar, alterar e apagar registro.
 *
 * Esta rota decide só **quem** pode: sessão da casa e mesma origem (não aceita
 * chave de serviço — é ação de gente, com confirmação na tela, não tarefa de
 * robô). Resolução da zona, validação e auditoria ficam em
 * `lib/dominios/dns/escrita.ts`, o mesmo caminho que o portal do cliente usa.
 */
async function tratar(request: NextRequest, params: Promise<{ fqdn: string }>) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  try {
    const { fqdn } = await params;
    const corpo = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    const operacao = lerOperacaoDns(request.method, corpo);
    const registro = await executarOperacaoDns(decodeURIComponent(fqdn), operacao, { id: admin.id, origem: "EQUIPE" });
    return NextResponse.json({ ok: true, ...(registro ? { registro } : {}) });
  } catch (e) {
    if (e instanceof ErroDeDns) {
      return NextResponse.json({ ok: false, error: e.message, problemas: e.problemas }, { status: e.status });
    }
    console.error("[dns] erro inesperado na rota da equipe", e);
    return NextResponse.json({ ok: false, error: "Não foi possível alterar o DNS." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ fqdn: string }> }) {
  return tratar(request, params);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ fqdn: string }> }) {
  return tratar(request, params);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ fqdn: string }> }) {
  return tratar(request, params);
}
