import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { pedirConfirmacao, temConfirmacaoRecente } from "@/lib/confirmacao-recente";
import { origemEstrita } from "@/lib/http";
import {
  COOKIE_DE_ESTADO,
  VALIDADE_DO_ESTADO_SEGUNDOS,
  assinarEstado,
  credenciaisDaAplicacao,
  urlDeAutorizacao,
} from "@/lib/mercadopago-oauth";

export const runtime = "nodejs";

/**
 * Começa a conexão: devolve o endereço da tela de autorização do Mercado Pago.
 *
 * É POST, e não um link, porque conectar troca a conta que RECEBE o dinheiro
 * da casa: pede origem estrita e a senha de novo, como trocar o certificado. A
 * tela navega para o endereço devolvido.
 */
export async function POST(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  if (!ehDono(admin.role)) {
    return NextResponse.json({ erro: "Só o dono da conta pode isto." }, { status: 403 });
  }
  if (!origemEstrita(request)) {
    return NextResponse.json({ erro: "Origem não autorizada." }, { status: 403 });
  }
  if (!(await temConfirmacaoRecente(admin.id))) return pedirConfirmacao();

  const { clientId, clientSecret } = await credenciaisDaAplicacao();
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { erro: "Guarde antes o Client ID e o Client Secret da aplicação do Mercado Pago, nos campos abaixo." },
      { status: 409 },
    );
  }

  const estado = assinarEstado(admin.id);
  (await cookies()).set(COOKIE_DE_ESTADO, estado, {
    httpOnly: true,
    // `lax`: a volta do Mercado Pago é uma navegação vinda de outro site, e
    // `strict` não mandaria o cookie justamente nela.
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/empresa/mercadopago/oauth",
    maxAge: VALIDADE_DO_ESTADO_SEGUNDOS,
  });

  return NextResponse.json({ url: urlDeAutorizacao(clientId, estado) });
}
