import { NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { diagnosticarMercadoPago } from "@/lib/mercadopago";

export const runtime = "nodejs";

/** Diagnóstico sob demanda do Mercado Pago (token + webhook), só para o dono. */
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
    ok: d.tokenOk && !d.erro && Boolean(d.webhookUrl),
    linhas: [
      { rotulo: "Credencial (token)", valor: d.tokenOk ? "ok" : "falhou" },
      { rotulo: "Conta", valor: d.conta ?? "—" },
      { rotulo: "Webhook", valor: d.webhookUrl ?? "não configurado" },
    ],
    erro: d.erro,
  });
}
