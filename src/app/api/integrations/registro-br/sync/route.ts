import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { isServiceCall } from "@/lib/service-auth";
import { sincronizarVencimentosBr } from "@/lib/dominio-vencimento";

export const runtime = "nodejs";

/**
 * Relê no Registro.br o vencimento de todo domínio `.br` da carteira.
 *
 * Aceita a sessão de admin (botão "Atualizar vencimentos" na tela de Domínios)
 * e a chave de serviço (o n8n roda isto de madrugada). Como é leitura de fonte
 * pública gravada na nossa base, não há efeito fora daqui.
 */
export async function POST(request: NextRequest) {
  const admin = await getAdmin();
  const servico = isServiceCall(request);
  if (!admin && !servico) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const { resumo, dominios } = await sincronizarVencimentosBr(admin?.id ?? null, { forcar: true });
    return NextResponse.json({ ok: true, resumo, dominios });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Não foi possível consultar o Registro.br.",
      },
      { status: 502 },
    );
  }
}
