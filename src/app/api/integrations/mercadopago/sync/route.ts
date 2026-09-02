import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { isServiceCall } from "@/lib/service-auth";
import { runMercadoPagoSync } from "@/lib/sync-mercadopago";

export const runtime = "nodejs";

/**
 * Traz os recebimentos do Mercado Pago para o extrato.
 *
 * Mesmos dois chamadores do Éfi: o botão "Sincronizar agora" (sessão de admin)
 * e o cron do n8n (`x-service-key`). Sem o cron o extrato envelhece até alguém
 * clicar, que foi o motivo de o Éfi ter ganhado o dele.
 */
export async function POST(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin && !isServiceCall(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  let days = 90;
  try {
    const body = (await request.json()) as { days?: unknown };
    if (typeof body.days === "number" && Number.isFinite(body.days)) {
      days = Math.max(1, Math.min(365, Math.trunc(body.days)));
    }
  } catch {
    // Corpo vazio usa o período padrão.
  }

  try {
    const result = await runMercadoPagoSync({ actorId: admin?.id ?? "servico:n8n", days });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Não foi possível sincronizar o Mercado Pago.",
      },
      { status: 502 },
    );
  }
}
