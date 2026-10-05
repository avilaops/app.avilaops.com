import { NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { diagnosticarMercadoPago } from "@/lib/mercadopago";

export const runtime = "nodejs";

/** Diagnóstico sob demanda do Mercado Pago (token, URL e segredo do webhook), só para o dono. */
export async function GET() {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "Faça login para continuar." }, { status: 401 });
  }
  if (!ehDono(admin.role)) {
    return NextResponse.json({ erro: "Só o dono pode diagnosticar." }, { status: 403 });
  }
  const d = await diagnosticarMercadoPago();
  return NextResponse.json({
    ok: d.tokenOk && d.segredoOk && Boolean(d.webhookUrl) && !d.erro,
    linhas: [
      { rotulo: "Credencial (token)", valor: d.tokenOk ? "ok" : "falhou" },
      { rotulo: "Conta", valor: d.conta ?? "—" },
      // URL já sem a query: o MP_WEBHOOK_TOKEN não sai do servidor.
      { rotulo: "Webhook", valor: d.webhookUrl ?? "não configurado" },
      { rotulo: "Segredo do webhook", valor: d.segredoOk ? "configurado" : "ausente" },
    ],
    erro: d.erro,
  });
}
