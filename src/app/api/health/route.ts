import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Saúde e versão do painel.
 *
 * Criado em 31/08/2026 pelo mesmo motivo que o do Comandeiro: nada no sistema
 * sabia dizer qual commit estava no ar, e a árvore do `/opt` tinha ficado 57
 * arquivos atrás da `main` sem ninguém perceber. Descobrir isso exigiu baixar
 * a pasta inteira e comparar arquivo por arquivo; com o SHA aqui, vira uma
 * requisição.
 *
 * Sem autenticação, como os outros health checks da casa. Um hash de commit
 * não abre porta nenhuma — o que ele entrega é a capacidade de comparar
 * `curl .../api/health` com `git log -1`.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  // Fora do try: faltar a variável é problema de deploy, não de banco, e os
  // dois precisam aparecer separados.
  const versao = {
    commit: process.env.GIT_SHA || "desconhecido",
    construidoEm: process.env.BUILT_AT || "desconhecido",
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", ...versao });
  } catch {
    return NextResponse.json({ status: "degraded", ...versao }, { status: 503 });
  }
}
