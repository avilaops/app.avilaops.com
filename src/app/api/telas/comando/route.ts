import { NextRequest, NextResponse } from "next/server";
import { anotar, ehResposta, falha, operadorOuRecusa } from "@/lib/telas-acoes";
import { enviarComando } from "@/lib/avila-tv";

/**
 * Comandos que este painel oferece.
 *
 * A lista é curta de propósito e **não** é a lista do protocolo: `exibir` fica
 * de fora porque trocar o que uma tela mostra é decisão de conteúdo, tem
 * allowlist por dispositivo e nasce no n8n ou no painel do agente. Daqui saem
 * os comandos de operação — os que alguém usa olhando para uma tela que está
 * com problema.
 */
const PERMITIDOS = new Set([
  "recarregar", "mensagem", "reiniciar", "dormir", "acordar",
  // Só o cliente do tipo `agente` responde este: é uma leitura do inventário
  // da LAN. `dispositivo` (executar ação num aparelho) continua de fora — é
  // operação de outro assunto, e vai nascer onde esse assunto morar.
  "dispositivos",
]);

export async function POST(request: NextRequest) {
  const admin = await operadorOuRecusa(request);
  if (ehResposta(admin)) return admin;

  const corpo = (await request.json().catch(() => null)) as
    | { dispositivo?: unknown; comando?: unknown; texto?: unknown }
    | null;
  const dispositivo = typeof corpo?.dispositivo === "string" ? corpo.dispositivo.trim() : "";
  const comando = typeof corpo?.comando === "string" ? corpo.comando.trim() : "";
  if (!dispositivo) return NextResponse.json({ error: "Diga qual tela." }, { status: 422 });
  if (!PERMITIDOS.has(comando)) return NextResponse.json({ error: `Comando não oferecido por este painel: ${comando}.` }, { status: 422 });

  const params: Record<string, unknown> = {};
  if (comando === "mensagem") {
    const texto = typeof corpo?.texto === "string" ? corpo.texto.trim().slice(0, 140) : "";
    if (!texto) return NextResponse.json({ error: "Escreva o aviso que vai aparecer na tela." }, { status: 422 });
    params.texto = texto;
  }

  try {
    const resposta = await enviarComando(dispositivo, comando, params);
    // Comando que a tela recusou (`ok: false`) não é erro do painel: a tela
    // respondeu, e o que ela disse é o que o operador precisa ler.
    await anotar(admin, "TV_SCREEN_COMMAND", dispositivo, { comando, params, resultado: resposta.resultado });
    return NextResponse.json(resposta);
  } catch (erro) {
    return falha(erro);
  }
}
