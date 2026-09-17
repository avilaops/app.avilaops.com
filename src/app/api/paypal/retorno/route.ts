import { NextRequest, NextResponse } from "next/server";
import { capturarOrdem } from "@/lib/paypal";
import { baixarCobrancaPorIdExterno } from "@/lib/assinaturas";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const ordemId = request.nextUrl.searchParams.get("token");
  const portal = new URL("/portal", process.env.APP_URL ?? "https://app.avilaops.com");
  if (!ordemId) {
    portal.searchParams.set("pagamento", "invalido");
    return NextResponse.redirect(portal);
  }

  try {
    const ordem = await capturarOrdem(ordemId);
    const captura = ordem.purchase_units?.[0]?.payments?.captures?.[0];
    if (!captura?.id) throw new Error("PayPal não devolveu a captura.");
    const cobranca = await prisma.subscriptionCharge.findFirst({ where: { externalId: ordemId, provider: "PAYPAL" } });
    if (!cobranca) throw new Error("Cobrança PayPal não encontrada.");
    await prisma.subscriptionCharge.update({ where: { id: cobranca.id }, data: { externalId: captura.id } });
    await baixarCobrancaPorIdExterno(captura.id, captura.status);
    portal.searchParams.set("pagamento", captura.status === "COMPLETED" ? "confirmado" : "processando");
  } catch (erro) {
    console.error("[paypal] falha ao capturar ordem", ordemId, erro);
    portal.searchParams.set("pagamento", "erro");
  }
  return NextResponse.redirect(portal);
}
