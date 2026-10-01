import { NextRequest, NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { IconeInvalido, renomearCasa } from "@/lib/identidade-casa";

export const runtime = "nodejs";

/** O nome que aparece ao lado do ícone, no topo de toda tela. */
export async function PUT(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  if (!ehDono(admin.role)) {
    return NextResponse.json({ erro: "Só o dono da conta pode isto." }, { status: 403 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ erro: "Origem não autorizada." }, { status: 403 });
  }

  const corpo = (await request.json().catch(() => null)) as { nome?: unknown } | null;
  if (typeof corpo?.nome !== "string") {
    return NextResponse.json({ erro: "Informe o nome." }, { status: 400 });
  }

  try {
    const nome = await renomearCasa(corpo.nome, admin.id);
    return NextResponse.json({ ok: true, nome });
  } catch (erro) {
    if (erro instanceof IconeInvalido) {
      return NextResponse.json({ erro: erro.message }, { status: 400 });
    }
    return NextResponse.json({ erro: "Não consegui salvar o nome." }, { status: 500 });
  }
}
