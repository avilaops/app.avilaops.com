import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { isServiceCall } from "@/lib/service-auth";
import { runEfiSync } from "@/lib/sync";

export const runtime = "nodejs";

/**
 * Sincroniza o Éfi. Dois chamadores: o botão "Sincronizar agora" (sessão de
 * admin) e o cron diário do n8n "Ávila OS — Sincronizar Éfi" (x-service-key).
 * Antes só o botão entrava, e o saldo do painel envelhecia até alguém clicar.
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
    const result = await runEfiSync({ actorId: admin?.id ?? "servico:n8n", days });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível sincronizar o Éfi.",
      },
      { status: 502 },
    );
  }
}
