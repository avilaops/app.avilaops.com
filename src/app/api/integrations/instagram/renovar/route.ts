import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { renovarTokensDoInstagram } from "@/lib/instagram-renovacao";
import { isServiceCall } from "@/lib/service-auth";

export const runtime = "nodejs";

/**
 * Rodada de renovação dos tokens do Instagram.
 *
 * Duas portas de propósito: o agendador diário entra pela chave de serviço
 * (`x-service-key`, a mesma credencial que o n8n já usa), e o admin entra pela
 * sessão para renovar um cliente na hora, quando o cliente liga dizendo que o
 * Instagram sumiu. A rotina é a mesma nos dois casos — não existe um caminho
 * "manual" que faça coisa diferente do automático.
 *
 * Sem `organizationId`, roda em todos os clientes. Com, roda só naquele.
 */
export async function POST(request: NextRequest) {
  const admin = await getAdmin();
  const servico = isServiceCall(request);
  if (!admin && !servico) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  let corpo: { organizationId?: unknown } = {};
  try {
    corpo = await request.json();
  } catch {
    corpo = {};
  }
  const organizationId =
    typeof corpo.organizationId === "string" && corpo.organizationId.trim()
      ? corpo.organizationId.trim()
      : undefined;

  try {
    const relatorio = await renovarTokensDoInstagram({
      organizationId,
      actorId: admin?.id ?? null,
    });
    return NextResponse.json({ ok: true, ...relatorio });
  } catch (erro) {
    return NextResponse.json(
      {
        ok: false,
        error:
          erro instanceof Error ? erro.message : "Não foi possível renovar os tokens do Instagram.",
      },
      { status: 502 },
    );
  }
}
