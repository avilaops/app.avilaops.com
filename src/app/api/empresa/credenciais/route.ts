import { NextRequest, NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { salvarCredencial } from "@/lib/credenciais";
import { financeiraPorSlug } from "@/lib/credenciais-financeiro";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Salva as chaves de uma financeira, todas de uma vez.
 *
 * O cofre já tem uma porta genérica (`/api/credenciais`), e ela continua sendo
 * a certa para chave avulsa. Esta existe por uma diferença que importa: aqui a
 * chave **tem que estar no catálogo** da financeira. Sem isso, um formulário de
 * cinco campos vira cinco requisições soltas, e um erro de digitação no nome da
 * variável cria uma chave órfã que ninguém lê — foi assim que o parque chegou a
 * ter `MERCADO_PAGO_ACCES_TOKEN_PROD`, com o typo, ao lado da chave certa.
 *
 * Campo em branco não apaga o que já está guardado: quem quer tirar um valor
 * usa o botão de remover, que é explícito. Um formulário reenviado sem
 * preencher de novo os segredos (o normal, já que eles chegam mascarados) não
 * pode esvaziar o cofre.
 */
export async function POST(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  if (!ehDono(admin.role)) {
    return NextResponse.json({ erro: "Só o dono da conta pode isto." }, { status: 403 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ erro: "Origem não autorizada." }, { status: 403 });
  }

  const corpo = (await request.json().catch(() => null)) as
    | { financeira?: unknown; valores?: unknown }
    | null;

  const slug = typeof corpo?.financeira === "string" ? corpo.financeira : "";
  const financeira = financeiraPorSlug(slug);
  if (!financeira) {
    return NextResponse.json({ erro: "Financeira desconhecida." }, { status: 400 });
  }

  const valores = corpo?.valores;
  if (!valores || typeof valores !== "object" || Array.isArray(valores)) {
    return NextResponse.json({ erro: "Informe os valores." }, { status: 400 });
  }

  const conhecidas = new Map(financeira.campos.map((campo) => [campo.chave, campo]));
  const guardadas: string[] = [];

  for (const [chave, bruto] of Object.entries(valores as Record<string, unknown>)) {
    const campo = conhecidas.get(chave);
    if (!campo) {
      return NextResponse.json(
        { erro: `A chave ${chave} não pertence a ${financeira.nome}.` },
        { status: 400 },
      );
    }

    const valor = typeof bruto === "string" ? bruto.trim() : "";
    if (!valor) continue;

    await salvarCredencial(
      {
        chave,
        valor,
        rotulo: campo.rotulo,
        descricao: campo.ajuda,
        origem: `tela:empresa/credenciais/${financeira.slug}`,
      },
      admin.id,
    );
    guardadas.push(chave);
  }

  if (guardadas.length === 0) {
    return NextResponse.json({ erro: "Nenhum campo foi preenchido." }, { status: 400 });
  }

  // Dinheiro deixa rastro: quem trocou a chave de qual financeira, e quando. O
  // VALOR nunca entra no evento — a auditoria registra o movimento, não o
  // segredo.
  await prisma.operationsAuditEvent.create({
    data: {
      actorId: admin.id,
      action: "CREDENCIAL_FINANCEIRA_ATUALIZADA",
      entityType: "PlatformCredential",
      entityId: financeira.slug,
      metadata: { financeira: financeira.nome, chaves: guardadas },
    },
  });

  return NextResponse.json({ ok: true, guardadas });
}
