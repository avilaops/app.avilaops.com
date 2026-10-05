import { NextRequest, NextResponse } from "next/server";
import { ErroDeDns } from "@/lib/dominios/dns/escrita";
import { exportarZonaBind } from "@/lib/dominios/dns/exportacao";
import { exigirPortal } from "@/lib/portal-acesso";

export const runtime = "nodejs";

/**
 * Baixar a zona em BIND. Quem vê a zona pode levá-la: a equipe do cliente
 * também, porque é dado da empresa dele e é a garantia de saída.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ fqdn: string }> }) {
  const acesso = await exigirPortal(request, { administrar: false });
  if (acesso.erro) return acesso.erro;

  try {
    const { fqdn } = await params;
    const arquivo = await exportarZonaBind(
      decodeURIComponent(fqdn),
      { id: acesso.sessao.id, origem: "CLIENTE" },
      { organizationId: acesso.organizationId },
      request.nextUrl.searchParams.get("versao"),
    );
    return new NextResponse(arquivo.conteudo, {
      headers: {
        "Content-Type": "text/dns; charset=utf-8",
        "Content-Disposition": `attachment; filename="${arquivo.nomeArquivo}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof ErroDeDns) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[dns] erro inesperado ao exportar pelo portal", e);
    return NextResponse.json({ error: "Não foi possível exportar a zona." }, { status: 500 });
  }
}
