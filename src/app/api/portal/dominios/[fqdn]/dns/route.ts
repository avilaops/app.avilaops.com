import { NextRequest, NextResponse } from "next/server";
import { ErroDeDns, executarOperacaoDns, lerOperacaoDns } from "@/lib/dominios/dns/escrita";
import { exigirPortal } from "@/lib/portal-acesso";

export const runtime = "nodejs";

/**
 * O cliente editando o DNS dos próprios domínios (decisão D5 do
 * cliente.avilaops.com: self-service, a equipe atua na exceção).
 *
 * Três guardas antes do serviço de escrita:
 *
 * 1. só o **dono do negócio** (`ADMIN`) escreve, com participação vigente que
 *    permita administrar a empresa. A equipe dele (`CLIENT`) vê a zona e não
 *    mexe: apagar um MX derruba o e-mail da empresa inteira;
 * 2. a empresa vem da sessão, nunca da URL ou do corpo;
 * 3. o domínio precisa ser dessa empresa — o de outra responde 404, igual a um
 *    domínio que não existe.
 *
 * Daí para baixo é o mesmo caminho da equipe, com a origem `CLIENTE` gravada
 * na trilha.
 */
async function tratar(request: NextRequest, params: Promise<{ fqdn: string }>) {
  const acesso = await exigirPortal(request, {
    administrar: true,
    motivoSemPermissao: "Só o responsável pela empresa altera o DNS.",
  });
  if (acesso.erro) return acesso.erro;
  const { sessao, organizationId } = acesso;

  try {
    const { fqdn } = await params;
    const corpo = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    const operacao = lerOperacaoDns(request.method, corpo);
    const registro = await executarOperacaoDns(
      decodeURIComponent(fqdn),
      operacao,
      { id: sessao.id, origem: "CLIENTE" },
      { organizationId },
    );
    return NextResponse.json({ ok: true, ...(registro ? { registro } : {}) });
  } catch (e) {
    if (e instanceof ErroDeDns) {
      return NextResponse.json({ ok: false, error: e.message, problemas: e.problemas }, { status: e.status });
    }
    console.error("[dns] erro inesperado na rota do portal", e);
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
