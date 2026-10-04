import { NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { diagnosticarWebhook } from "@/lib/paypal";

export const runtime = "nodejs";

/** Diagnóstico sob demanda do PayPal (OAuth + webhook), só para o dono. */
export async function GET() {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "Faça login para continuar." }, { status: 401 });
  }
  if (!ehDono(admin.role)) {
    return NextResponse.json({ erro: "Só o dono pode diagnosticar." }, { status: 403 });
  }
  const diagnostico = await diagnosticarWebhook();
  return NextResponse.json(diagnostico);
}
