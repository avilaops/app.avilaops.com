import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { origemEstrita } from "@/lib/http";
import { reaisParaCentavos } from "@/lib/lojas-catalogo";
import { editarProduto, lerProduto, PlataformaIndisponivel, RespostaDaPlataforma, type EdicaoDeProduto } from "@/lib/lojas-plataforma";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Altera situação, categoria e preço de um produto de uma loja.
 *
 * Quem grava é a plataforma de lojas, pelo mesmo caminho do painel dela, e é lá
 * que fica o histórico oficial (campos, antes, depois, e quem: o nome de quem
 * está logado aqui vai como autor). Este lado confere quem pode, valida o que
 * chegou, manda **só o que mudou** e deixa um evento na auditoria do painel.
 *
 * Equipe da casa pode: é operação de catálogo, não dinheiro da Ávila Ops.
 * Estoque não entra — é do lojista ou do ERP.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  if (!origemEstrita(request)) return NextResponse.json({ erro: "Origem não autorizada." }, { status: 403 });

  const { slug, id } = await params;
  const corpo = (await request.json().catch(() => null)) as
    | { versao?: unknown; ativo?: unknown; categoria?: unknown; preco?: unknown }
    | null;
  if (!corpo || typeof corpo.versao !== "number") return NextResponse.json({ erro: "Recarregue a página do produto e tente de novo." }, { status: 400 });

  // O estado atual, lido agora na plataforma: é contra ele que se decide o que mudou.
  let atual;
  try {
    atual = (await lerProduto(slug, id)).produto;
  } catch (erro) {
    return recusar(erro);
  }

  const edicao: EdicaoDeProduto = { autor: admin.nome.slice(0, 60), versao: corpo.versao };
  const antes: Record<string, string | number | boolean | null> = {};
  const depois: Record<string, string | number | boolean | null> = {};

  if (typeof corpo.ativo === "boolean" && corpo.ativo !== atual.ativo) {
    edicao.ativo = corpo.ativo;
    antes.ativo = atual.ativo;
    depois.ativo = corpo.ativo;
  }
  if (corpo.categoria === null || typeof corpo.categoria === "string") {
    const nova = corpo.categoria === null || corpo.categoria === "" ? null : corpo.categoria.trim().slice(0, 120);
    if (nova !== (atual.categoria?.slug ?? null)) {
      edicao.categoria = nova;
      antes.categoria = atual.categoria?.slug ?? null;
      depois.categoria = nova;
    }
  }
  if (typeof corpo.preco === "string") {
    // Campo vazio é "sob consulta" (preço zero), a regra da vitrine. Texto que
    // não é número é erro: não vira zero em silêncio.
    const centavos = corpo.preco.trim() === "" ? 0 : reaisParaCentavos(corpo.preco);
    if (centavos === null) return NextResponse.json({ erro: "Preço inválido. Use números, como 49,90." }, { status: 400 });
    if (centavos > 10_000_000_000) return NextResponse.json({ erro: "Preço acima do limite." }, { status: 400 });
    if (centavos !== atual.precoCentavos) {
      edicao.precoCentavos = centavos;
      antes.precoCentavos = atual.precoCentavos;
      depois.precoCentavos = centavos;
    }
  }

  if (Object.keys(depois).length === 0) return NextResponse.json({ ok: true, gravados: [], versao: atual.versaoCatalogo });

  try {
    const resultado = await editarProduto(slug, id, edicao);
    // Só depois de a plataforma confirmar. O histórico oficial é o dela; este
    // evento põe a alteração na trilha do painel, com quem, loja, campos e valores.
    await auditar(admin.id, slug, "LOJA_PRODUTO_ALTERADO", {
      produtoId: id,
      produto: atual.nome.slice(0, 200),
      campos: resultado.gravados,
      antes,
      depois,
      versao: resultado.produto.versaoCatalogo,
    });
    return NextResponse.json({ ok: true, gravados: resultado.gravados, versao: resultado.produto.versaoCatalogo });
  } catch (erro) {
    return recusar(erro);
  }
}

function recusar(erro: unknown) {
  const motivo = erro instanceof Error ? erro.message : "Não consegui falar com a plataforma de lojas.";
  const status = erro instanceof RespostaDaPlataforma ? ([404, 409, 422].includes(erro.status) ? erro.status : 502) : erro instanceof PlataformaIndisponivel ? 503 : 502;
  return NextResponse.json({ erro: motivo }, { status });
}

/** Falha ao gravar o rastro não desfaz a alteração (o histórico oficial já existe na plataforma) — mas grita no log. */
async function auditar(atorId: string, slug: string, action: string, metadata: Record<string, unknown>) {
  try {
    await prisma.operationsAuditEvent.create({
      data: { actorId: atorId, action, entityType: "LojaDaPlataforma", entityId: slug, metadata: metadata as object },
    });
  } catch (erro) {
    console.error(`[lojas] SEM RASTRO: ${action} de ${slug} não foi gravada na auditoria do painel`, erro);
  }
}
