import { NextRequest, NextResponse } from "next/server";
import { ehDaCasa, getAdmin } from "@/lib/auth";
import { competenciaDe, gerarFaturasDaCompetencia, marcarFaturasVencidas } from "@/lib/faturamento-recorrente";
import { isServiceCall } from "@/lib/service-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A rodada do faturamento recorrente: fatura do mês e vencimento.
 *
 * `GET` simula — diz o que a rodada faria, sem gravar. `POST` executa. Quem
 * agenda é o n8n, uma vez por dia, com `x-service-key`; a equipe também pode
 * chamar logada. A competência é sempre a do mês corrente no Brasil: rodar
 * mês passado ou mês que vem por engano geraria fatura retroativa ou
 * adiantada para a carteira inteira, e isso não se desfaz com um clique.
 */
async function autorizado(request: NextRequest): Promise<boolean> {
  if (isServiceCall(request)) return true;
  const admin = await getAdmin();
  return Boolean(admin && ehDaCasa(admin.role));
}

async function rodar(request: NextRequest, simular: boolean) {
  if (!(await autorizado(request))) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const agora = new Date();
  try {
    const faturas = await gerarFaturasDaCompetencia({ competencia: competenciaDe(agora), simular });
    const vencimento = await marcarFaturasVencidas({ agora, simular });
    // Falha de uma assinatura não é falha da rodada, mas o agendador precisa
    // enxergar: 207 faz o n8n marcar a execução para olhar.
    return NextResponse.json({ ok: faturas.falhas.length === 0, faturas, vencimento }, { status: faturas.falhas.length ? 207 : 200 });
  } catch (erro) {
    console.error("[faturamento] a rodada falhou", erro);
    return NextResponse.json({ erro: "A rodada do faturamento falhou." }, { status: 500 });
  }
}

export function GET(request: NextRequest) {
  return rodar(request, true);
}

export function POST(request: NextRequest) {
  return rodar(request, false);
}
