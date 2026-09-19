import { NextRequest, NextResponse } from "next/server";
import { manutencaoDosTokensDoInstagram } from "@/lib/instagram";

export const runtime = "nodejs";

/**
 * Renovação diária dos tokens do Instagram.
 *
 * Fica em `/api/internal` e atrás de bearer, no mesmo padrão da coleta de
 * monitoramento: quem chama é um timer do servidor, não gente logada. Sessão
 * de usuário não serve aqui porque a rotina precisa rodar de madrugada, sem
 * ninguém na frente da tela.
 *
 * O token do Instagram vale 60 dias e a Meta não renova token vencido. Sem
 * esta rotina, a conexão de cada cliente morre sozinha dois meses depois de
 * criada, e o primeiro a perceber é o cliente.
 */
export async function POST(request: NextRequest) {
  const esperado = process.env.MONITORING_INGEST_TOKEN?.trim();
  if (!esperado || request.headers.get("authorization") !== `Bearer ${esperado}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const resultado = await manutencaoDosTokensDoInstagram();

  // 200 mesmo com falha: o timer não deve tratar "um cliente falhou" como
  // execução quebrada e ficar repetindo. O que aconteceu vai no corpo e fica
  // gravado na própria conexão.
  return NextResponse.json({ ok: true, ...resultado });
}
