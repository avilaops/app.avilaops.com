import { NextRequest, NextResponse } from "next/server";
import { assinaturaDoProduto } from "@/lib/assinaturas";
import { verifyServiceJwt } from "@/lib/service-auth";

/**
 * A fatura do cliente, para o produto exibir (levantamento §4).
 *
 * Máquina-a-máquina, JWT de serviço — nunca chamada pelo navegador do cliente
 * final. É o produto que pergunta, com o seu próprio segredo, e o produto já
 * autenticou o dono do restaurante antes de perguntar.
 *
 * O par (produto, tenant) é a chave: o produto não conhece `Organization`, e é
 * isso que deixa trocar o CNPJ do cliente aqui sem tocar em nada lá.
 */
export async function GET(req: NextRequest) {
  if (!verifyServiceJwt(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const produto = req.nextUrl.searchParams.get("produto")?.trim();
  const tenant = req.nextUrl.searchParams.get("tenant")?.trim();

  if (!produto || !tenant) {
    return NextResponse.json({ error: "Informe produto e tenant." }, { status: 400 });
  }

  const assinatura = await assinaturaDoProduto({
    productKey: produto,
    productTenantId: tenant,
  });

  // 404 e não 200 com nulo: "este cliente não tem assinatura cadastrada" é
  // estado diferente de "tem assinatura sem fatura", e o produto desenha
  // telas diferentes para cada um.
  if (!assinatura) {
    return NextResponse.json({ error: "Assinatura não encontrada." }, { status: 404 });
  }

  return NextResponse.json({ assinatura });
}
