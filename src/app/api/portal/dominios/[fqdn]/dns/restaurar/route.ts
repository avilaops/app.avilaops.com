import { NextRequest, NextResponse } from "next/server";
import { ErroDeDns, restaurarVersaoDns } from "@/lib/dominios/dns/escrita";
import { cleanText } from "@/lib/http";
import { exigirPortal } from "@/lib/portal-acesso";

export const runtime = "nodejs";

/** O cliente volta a zona a uma versão. Mesma porta da edição: só o dono do negócio. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ fqdn: string }> }) {
  const acesso = await exigirPortal(request, {
    administrar: true,
    motivoSemPermissao: "Só o responsável pela empresa restaura o DNS.",
  });
  if (acesso.erro) return acesso.erro;

  try {
    const { fqdn } = await params;
    const corpo = ((await request.json().catch(() => ({}))) ?? {}) as { versaoId?: unknown };
    const versaoId = cleanText(corpo.versaoId, 64);
    if (!versaoId) throw new ErroDeDns("Informe a versão.");
    const resultado = await restaurarVersaoDns(
      decodeURIComponent(fqdn),
      versaoId,
      { id: acesso.sessao.id, origem: "CLIENTE" },
      { organizationId: acesso.organizationId },
    );
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    if (e instanceof ErroDeDns) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    console.error("[dns] erro inesperado ao restaurar pelo portal", e);
    return NextResponse.json({ ok: false, error: "Não foi possível restaurar a zona." }, { status: 500 });
  }
}
