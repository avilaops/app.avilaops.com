import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import {
  COOKIE_DE_ESTADO,
  FICHA,
  MercadoPagoOAuthErro,
  estadoValido,
  guardarConexao,
  trocarCodigo,
} from "@/lib/mercadopago-oauth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * A volta do Mercado Pago, com o código que vira token.
 *
 * Só conclui para o mesmo dono que começou, no mesmo navegador: o `state` é
 * assinado com o id dele e tem de bater com o cookie posto na largada. O
 * cookie é gasto na primeira volta, valha ou não.
 *
 * Token de teste é recusado: guardado como `MP_ACCESS_TOKEN`, faria toda
 * cobrança da casa nascer no sandbox, com cara de cobrança de verdade.
 */
export async function GET(request: NextRequest) {
  const origem = process.env.APP_URL || "https://app.avilaops.com";
  const admin = await getAdmin();
  if (!admin) return NextResponse.redirect(new URL("/login", origem));
  if (!ehDono(admin.role)) return NextResponse.redirect(new URL("/mais", origem));

  const destino = new URL(FICHA, origem);
  const recusar = (motivo: string) => {
    destino.searchParams.set("erro", motivo);
    return NextResponse.redirect(destino);
  };

  const estado = request.nextUrl.searchParams.get("state");
  const jarra = await cookies();
  const esperado = jarra.get(COOKIE_DE_ESTADO)?.value;
  jarra.delete({ name: COOKIE_DE_ESTADO, path: "/api/empresa/mercadopago/oauth" });
  if (!esperado || estado !== esperado || !estadoValido(estado, admin.id)) {
    return recusar("A volta do Mercado Pago não confere ou expirou. Conecte de novo.");
  }

  const codigo = request.nextUrl.searchParams.get("code");
  if (request.nextUrl.searchParams.has("error") || !codigo) {
    return recusar("A autorização no Mercado Pago não foi concluída.");
  }

  try {
    const token = await trocarCodigo(codigo);
    if (!token.producao) {
      return recusar("O Mercado Pago devolveu um token de teste. Conecte com a conta e a aplicação de produção.");
    }
    await guardarConexao(token, admin.id, "oauth:conexao");
    // Trocar a conta que recebe deixa rastro, com a conta e sem o token.
    await prisma.operationsAuditEvent.create({
      data: {
        actorId: admin.id,
        action: "MERCADO_PAGO_CONECTADO_POR_OAUTH",
        entityType: "PlatformCredential",
        entityId: "mercado-pago",
        metadata: { userId: token.userId, expiraEm: token.expiraEm.toISOString() },
      },
    });
    destino.searchParams.set("conectado", "1");
    return NextResponse.redirect(destino);
  } catch (falha) {
    return recusar(
      falha instanceof MercadoPagoOAuthErro
        ? falha.message
        : "Não consegui concluir a conexão com o Mercado Pago.",
    );
  }
}
