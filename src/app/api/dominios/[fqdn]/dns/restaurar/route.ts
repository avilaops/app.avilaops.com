import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { ErroDeDns, restaurarVersaoDns } from "@/lib/dominios/dns/escrita";
import { cleanText, sameOrigin } from "@/lib/http";

export const runtime = "nodejs";

/** A equipe volta a zona de um domínio a uma versão. Ação de gente, com confirmação na tela. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ fqdn: string }> }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  try {
    const { fqdn } = await params;
    const corpo = ((await request.json().catch(() => ({}))) ?? {}) as { versaoId?: unknown };
    const versaoId = cleanText(corpo.versaoId, 64);
    if (!versaoId) throw new ErroDeDns("Informe a versão.");
    const resultado = await restaurarVersaoDns(decodeURIComponent(fqdn), versaoId, { id: admin.id, origem: "EQUIPE" });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    if (e instanceof ErroDeDns) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    console.error("[dns] erro inesperado ao restaurar pela equipe", e);
    return NextResponse.json({ ok: false, error: "Não foi possível restaurar a zona." }, { status: 500 });
  }
}
