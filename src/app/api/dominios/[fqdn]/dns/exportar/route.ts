import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { ErroDeDns } from "@/lib/dominios/dns/escrita";
import { exportarZonaBind } from "@/lib/dominios/dns/exportacao";

export const runtime = "nodejs";

/** A zona de um domínio em BIND, para a equipe. Gera evento de auditoria como toda exportação. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ fqdn: string }> }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  try {
    const { fqdn } = await params;
    const arquivo = await exportarZonaBind(
      decodeURIComponent(fqdn),
      { id: admin.id, origem: "EQUIPE" },
      undefined,
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
    console.error("[dns] erro inesperado ao exportar pela equipe", e);
    return NextResponse.json({ error: "Não foi possível exportar a zona." }, { status: 500 });
  }
}
