import { NextRequest, NextResponse } from "next/server";
import { cleanText } from "@/lib/http";
import { anotar, ehResposta, falha, operadorOuRecusa } from "@/lib/telas-acoes";
import { revogarTela } from "@/lib/avila-tv";

/**
 * Apaga o token da tela.
 *
 * Não depende de a tela estar no ar: o agente invalida o hash na hora, a
 * conexão cai e o próximo `ola` volta ao código de pareamento. É como se
 * recupera uma tela que saiu do controle sem ir até ela, e é por isso que
 * não tem volta: o token some, e vincular de novo cria outro dispositivo.
 * Sendo irreversível, é só do dono.
 */
export async function POST(request: NextRequest) {
  const admin = await operadorOuRecusa(request, { somenteDono: true });
  if (ehResposta(admin)) return admin;

  const corpo = (await request.json().catch(() => null)) as { dispositivo?: unknown } | null;
  const dispositivo = cleanText(corpo?.dispositivo, 64);
  if (!dispositivo) return NextResponse.json({ error: "Diga qual tela." }, { status: 422 });

  let resposta: Awaited<ReturnType<typeof revogarTela>>;
  try {
    resposta = await revogarTela(dispositivo);
  } catch (erro) {
    return falha(erro);
  }
  const auditoria = await anotar(admin, "TV_SCREEN_REVOKED", dispositivo, { nome: resposta.dispositivo?.nome ?? null });
  return NextResponse.json({ ...resposta, auditoria });
}
