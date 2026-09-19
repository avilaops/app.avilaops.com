import { NextRequest, NextResponse } from "next/server";
import { anotar, ehResposta, falha, operadorOuRecusa } from "@/lib/telas-acoes";
import { parearTela } from "@/lib/avila-tv";

/**
 * Aprova o código de 6 letras que a tela está mostrando e batiza o aparelho.
 *
 * É a única porta pela qual uma tela entra: o token de 32 bytes nasce no
 * agente, sai uma vez só para o aparelho e nunca mais é legível — nem aqui.
 * Por isso a resposta traz a ficha sem segredo, e não o token.
 */
export async function POST(request: NextRequest) {
  const admin = await operadorOuRecusa(request);
  if (ehResposta(admin)) return admin;

  const corpo = (await request.json().catch(() => null)) as { codigo?: unknown; nome?: unknown; origens?: unknown } | null;
  const codigo = typeof corpo?.codigo === "string" ? corpo.codigo.trim().toUpperCase() : "";
  const nome = typeof corpo?.nome === "string" ? corpo.nome.trim() : "";
  // Seis letras sem I, O, 0 e 1 — o alfabeto do protocolo evita justamente o
  // que se lê errado numa TV a três metros de distância.
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(codigo)) return NextResponse.json({ error: "Código inválido: seis letras, sem I e O." }, { status: 422 });
  if (!nome) return NextResponse.json({ error: "Dê um nome para a tela." }, { status: 422 });

  const origens = Array.isArray(corpo?.origens)
    ? corpo.origens.map(String).map((o) => o.trim()).filter(Boolean)
    : undefined;

  try {
    const { dispositivo } = await parearTela(codigo, nome, origens);
    await anotar(admin, "TV_SCREEN_PAIRED", dispositivo.id, { nome: dispositivo.nome, tenant: dispositivo.tenant, origens: origens ?? [] });
    return NextResponse.json({ dispositivo });
  } catch (erro) {
    return falha(erro);
  }
}
