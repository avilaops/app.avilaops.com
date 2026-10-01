import { NextRequest, NextResponse } from "next/server";
import { cleanText } from "@/lib/http";
import { anotar, COMANDOS_DO_PAINEL, ehResposta, falha, lerAviso, operadorOuRecusa } from "@/lib/telas-acoes";
import { enviarComando } from "@/lib/avila-tv";

export async function POST(request: NextRequest) {
  const admin = await operadorOuRecusa(request);
  if (ehResposta(admin)) return admin;

  const corpo = (await request.json().catch(() => null)) as
    | { dispositivo?: unknown; comando?: unknown; texto?: unknown }
    | null;
  const dispositivo = cleanText(corpo?.dispositivo, 64);
  const comando = cleanText(corpo?.comando, 32);
  if (!dispositivo) return NextResponse.json({ error: "Diga qual tela." }, { status: 422 });
  if (!COMANDOS_DO_PAINEL.has(comando)) {
    return NextResponse.json({ error: `Comando não oferecido por este painel: ${comando || "(vazio)"}.` }, { status: 422 });
  }

  const params: Record<string, unknown> = {};
  if (comando === "mensagem") {
    const aviso = lerAviso(corpo?.texto);
    if ("erro" in aviso) return NextResponse.json({ error: aviso.erro }, { status: 422 });
    params.texto = aviso.texto;
  }

  let resposta: Awaited<ReturnType<typeof enviarComando>>;
  try {
    resposta = await enviarComando(dispositivo, comando, params);
  } catch (erro) {
    return falha(erro);
  }
  // Comando que a tela recusou (`ok: false`) não é erro do painel: a tela
  // respondeu, e o que ela disse é o que o operador precisa ler.
  const auditoria = await anotar(admin, "TV_SCREEN_COMMAND", dispositivo, { comando, params, resultado: resposta.resultado });
  return NextResponse.json({ ...resposta, auditoria });
}
