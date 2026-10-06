import { NextRequest, NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { ErroDeParametro, registrarVersaoDeParametro } from "@/lib/parametros";
import { definicaoDe, lerValorDigitado } from "@/lib/parametros/catalogo";

export const runtime = "nodejs";

/**
 * Registra uma versão nova de parâmetro de política.
 *
 * Só o dono: é a decisão do "Dono do serviço" de POLITICAS-E-PARAMETROS, e um
 * prazo errado aqui muda o que acontece com domínio de cliente. Nunca altera a
 * versão anterior — a linha velha continua decidindo os eventos da época dela.
 * O valor chega como foi digitado e é lido aqui, pela mesma regra da tela.
 */
export async function POST(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!ehDono(admin.role)) {
    return NextResponse.json({ error: "Só o dono do serviço registra parâmetro." }, { status: 403 });
  }
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  const corpo = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === "string" ? v : "");
  const chave = texto(corpo.chave);
  const definicao = definicaoDe(chave);
  if (!definicao) return NextResponse.json({ error: "Parâmetro fora do catálogo." }, { status: 400 });

  const lido = lerValorDigitado(definicao.tipo, texto(corpo.valor));
  if ("problema" in lido) return NextResponse.json({ error: lido.problema, problemas: [lido.problema] }, { status: 400 });

  try {
    const versao = await registrarVersaoDeParametro(
      {
        chave,
        escopo: texto(corpo.escopo).trim().toLowerCase() || undefined,
        valor: lido.valor,
        estado: texto(corpo.estado),
        vigenteDesde: texto(corpo.vigenteDesde),
        revisarEm: texto(corpo.revisarEm) || null,
        fontes: texto(corpo.fontes).split(/[,;\n]/),
        dono: texto(corpo.dono),
        nota: texto(corpo.nota) || null,
      },
      admin.id,
    );
    return NextResponse.json({ ok: true, versao });
  } catch (e) {
    if (e instanceof ErroDeParametro) {
      return NextResponse.json({ ok: false, error: e.message, problemas: e.problemas }, { status: 422 });
    }
    console.error("[parametros] erro ao registrar versão", e);
    return NextResponse.json({ ok: false, error: "Não foi possível registrar a versão." }, { status: 500 });
  }
}
