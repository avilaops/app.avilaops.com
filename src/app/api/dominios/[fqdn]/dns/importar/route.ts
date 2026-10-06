import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { ErroDeDns, importarZonaBind, lerPedidoDeImportacao, previaImportacaoBind } from "@/lib/dominios/dns/escrita";
import { sameOrigin } from "@/lib/http";

export const runtime = "nodejs";

/**
 * A equipe importa um arquivo de zona BIND num domínio. Sem `assinatura`,
 * devolve a prévia; com a assinatura da prévia, aplica.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ fqdn: string }> }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  try {
    const { fqdn } = await params;
    const corpo = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    const { texto, assinatura } = lerPedidoDeImportacao(corpo);
    if (!assinatura) {
      return NextResponse.json({ ok: true, previa: await previaImportacaoBind(decodeURIComponent(fqdn), texto) });
    }
    const resultado = await importarZonaBind(decodeURIComponent(fqdn), texto, assinatura, { id: admin.id, origem: "EQUIPE" });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    if (e instanceof ErroDeDns) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    console.error("[dns] erro inesperado ao importar pela equipe", e);
    return NextResponse.json({ ok: false, error: "Não foi possível importar a zona." }, { status: 500 });
  }
}
