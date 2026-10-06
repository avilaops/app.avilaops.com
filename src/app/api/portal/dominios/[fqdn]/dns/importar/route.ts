import { NextRequest, NextResponse } from "next/server";
import { ErroDeDns, importarZonaBind, lerPedidoDeImportacao, previaImportacaoBind } from "@/lib/dominios/dns/escrita";
import { exigirPortal } from "@/lib/portal-acesso";

export const runtime = "nodejs";

/**
 * O cliente importa um arquivo de zona BIND. Sem `assinatura`, devolve a
 * prévia (nada muda); com a assinatura da prévia, aplica. Mesma porta da
 * edição: só o dono do negócio.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ fqdn: string }> }) {
  const acesso = await exigirPortal(request, {
    administrar: true,
    motivoSemPermissao: "Só o responsável pela empresa importa a zona.",
  });
  if (acesso.erro) return acesso.erro;

  try {
    const { fqdn } = await params;
    const corpo = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    const { texto, assinatura } = lerPedidoDeImportacao(corpo);
    const escopo = { organizationId: acesso.organizationId };
    if (!assinatura) {
      return NextResponse.json({ ok: true, previa: await previaImportacaoBind(decodeURIComponent(fqdn), texto, escopo) });
    }
    const resultado = await importarZonaBind(
      decodeURIComponent(fqdn),
      texto,
      assinatura,
      { id: acesso.sessao.id, origem: "CLIENTE" },
      escopo,
    );
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    if (e instanceof ErroDeDns) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    console.error("[dns] erro inesperado ao importar pelo portal", e);
    return NextResponse.json({ ok: false, error: "Não foi possível importar a zona." }, { status: 500 });
  }
}
