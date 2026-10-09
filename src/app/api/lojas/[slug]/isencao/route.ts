import { NextRequest, NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { pedirConfirmacao, temConfirmacaoRecente } from "@/lib/confirmacao-recente";
import { origemEstrita } from "@/lib/http";
import { mudarIsencao, PlataformaIndisponivel, RespostaDaPlataforma } from "@/lib/lojas-plataforma";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Marca ou tira a isenção de mensalidade de uma loja.
 *
 * Só o dono, com origem estrita e a senha confirmada há pouco: é decisão de
 * cobrança. Quem grava é a plataforma de lojas (`Tenant.cobrancaIsenta`), e
 * tirar a isenção não cria cobrança — a plataforma garante isso do lado dela.
 * O evento de auditoria só é gravado depois de a plataforma confirmar, com o
 * antes e o depois; recusa também deixa rastro.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  if (!ehDono(admin.role)) return NextResponse.json({ erro: "Só o dono da conta pode isto." }, { status: 403 });
  if (!origemEstrita(request)) return NextResponse.json({ erro: "Origem não autorizada." }, { status: 403 });
  if (!(await temConfirmacaoRecente(admin.id))) return pedirConfirmacao();

  const { slug } = await params;
  const corpo = (await request.json().catch(() => null)) as { isenta?: unknown; cienteDaRegua?: unknown } | null;
  if (typeof corpo?.isenta !== "boolean") return NextResponse.json({ erro: "Informe se a loja fica isenta." }, { status: 400 });

  try {
    const resultado = await mudarIsencao(slug, corpo.isenta, corpo.cienteDaRegua === true);
    if (resultado.mudou) {
      await auditar(admin.id, slug, "LOJA_ISENCAO_ALTERADA", {
        antes: resultado.antes.isenta,
        depois: resultado.depois.isenta,
        // O que a régua diria no momento da decisão: é o que explica a decisão depois.
        reguaNaHora: resultado.antes.seNaoFosseIsenta ?? "não cairia na régua",
        suspensaoAutomatica: resultado.antes.suspensaoAutomatica,
        temAssinatura: resultado.antes.temAssinatura,
      });
    }
    return NextResponse.json({ ok: true, mudou: resultado.mudou, isenta: resultado.depois.isenta });
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : "falhou";
    await auditar(admin.id, slug, "LOJA_ISENCAO_RECUSADA", { pedido: corpo.isenta, motivo: motivo.slice(0, 300) });
    const status = erro instanceof RespostaDaPlataforma ? (erro.status === 404 || erro.status === 409 || erro.status === 422 ? erro.status : 502) : erro instanceof PlataformaIndisponivel ? 503 : 502;
    return NextResponse.json({ erro: motivo }, { status });
  }
}

/** Falha ao gravar o rastro não desfaz a mudança, que já aconteceu na plataforma — mas grita no log. */
async function auditar(atorId: string, slug: string, action: string, metadata: Record<string, string | number | boolean>) {
  try {
    await prisma.operationsAuditEvent.create({ data: { actorId: atorId, action, entityType: "LojaDaPlataforma", entityId: slug, metadata } });
  } catch (erro) {
    console.error(`[lojas] SEM RASTRO: ${action} de ${slug} não foi gravada na auditoria`, metadata, erro);
  }
}
