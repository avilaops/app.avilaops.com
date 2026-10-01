import { NextRequest, NextResponse } from "next/server";
import { anotar, ehResposta, falha, lerOrigens, LIMITE_NOME, operadorOuRecusa } from "@/lib/telas-acoes";
import { parearTela } from "@/lib/avila-tv";

/**
 * Aprova o código de 6 letras que a tela está mostrando e batiza o aparelho.
 *
 * É a única porta pela qual uma tela entra: o token de 32 bytes nasce no
 * agente, sai uma vez só para o aparelho e nunca mais é legível, nem aqui.
 * Por isso a resposta traz a ficha sem segredo, e não o token.
 *
 * Vincular fica com a equipe da casa inteira (não só o dono): o token vai para
 * o aparelho, não para uma pessoa, e o vínculo errado se desfaz revogando.
 */
export async function POST(request: NextRequest) {
  const admin = await operadorOuRecusa(request);
  if (ehResposta(admin)) return admin;

  const corpo = (await request.json().catch(() => null)) as { codigo?: unknown; nome?: unknown; origens?: unknown } | null;
  const codigo = typeof corpo?.codigo === "string" ? corpo.codigo.trim().toUpperCase() : "";
  const nome = typeof corpo?.nome === "string" ? corpo.nome.trim() : "";
  // Seis letras, sem I e O, e sem algarismo nenhum: é o alfabeto do protocolo
  // (`ALFABETO_CODIGO`), que evita o que se lê errado numa TV a três metros.
  if (!/^[A-HJ-NP-Z]{6}$/.test(codigo)) return NextResponse.json({ error: "Código inválido: seis letras, sem I e O." }, { status: 422 });
  if (!nome) return NextResponse.json({ error: "Dê um nome para a tela." }, { status: 422 });
  if (nome.length > LIMITE_NOME) return NextResponse.json({ error: `Nome com mais de ${LIMITE_NOME} caracteres.` }, { status: 422 });

  const lidas = lerOrigens(corpo?.origens);
  if ("erro" in lidas) return NextResponse.json({ error: lidas.erro }, { status: 422 });
  const { origens } = lidas;

  let dispositivo: Awaited<ReturnType<typeof parearTela>>["dispositivo"];
  try {
    ({ dispositivo } = await parearTela(codigo, nome, origens));
  } catch (erro) {
    return falha(erro);
  }
  const auditoria = await anotar(admin, "TV_SCREEN_PAIRED", dispositivo.id, {
    codigo, nome: dispositivo.nome, tenant: dispositivo.tenant, origens,
  });
  return NextResponse.json({ dispositivo, auditoria });
}
