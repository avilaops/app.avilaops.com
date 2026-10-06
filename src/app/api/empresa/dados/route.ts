import { NextRequest, NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { DadosInvalidos, dadosFiscaisDaCasa, salvarDadosFiscais } from "@/lib/dados-da-casa";
import { origemEstrita } from "@/lib/http";

export const runtime = "nodejs";

/** Dados cadastrais e fiscais da casa: o cabeçalho da nota de serviço. */
export async function PUT(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  if (!ehDono(admin.role)) {
    return NextResponse.json({ erro: "Só o dono da conta pode isto." }, { status: 403 });
  }
  if (!origemEstrita(request)) {
    return NextResponse.json({ erro: "Origem não autorizada." }, { status: 403 });
  }

  const corpo = await request.json().catch(() => null);
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    return NextResponse.json({ erro: "Envie os dados da empresa." }, { status: 400 });
  }

  try {
    await salvarDadosFiscais(corpo as Record<string, unknown>, admin.id);
    // Devolve como ficou guardado (CNPJ só dígitos, alíquota "2,00"…): a tela
    // adota esta versão, senão ficaria dizendo que há o que salvar.
    return NextResponse.json({ ok: true, dados: await dadosFiscaisDaCasa() });
  } catch (erro) {
    if (erro instanceof DadosInvalidos) {
      return NextResponse.json({ erro: erro.message }, { status: 400 });
    }
    console.error("Falha ao salvar dados da casa:", erro);
    return NextResponse.json({ erro: "Não consegui salvar os dados." }, { status: 500 });
  }
}
