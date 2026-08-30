import { NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { runAutoReconciliation } from "@/lib/conciliacao-automatica";

export async function POST(request: Request) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  // Dinheiro, segredo e acesso são do dono; a equipe para aqui.
  if (!ehDono(admin.role)) return NextResponse.json({ error: "Só o dono da conta pode isto." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    days?: unknown;
    dryRun?: unknown;
  };

  const days =
    typeof body.days === "number" ? body.days : Number.parseInt(String(body.days ?? "180"), 10);

  try {
    const result = await runAutoReconciliation({
      actorId: admin.id,
      days: Number.isFinite(days) ? days : 180,
      dryRun: body.dryRun === true,
    });

    return NextResponse.json({
      ok: true,
      analyzed: result.analyzed,
      matched: result.matched,
      suggested: result.suggested,
      // A tela mostra os melhores; a lista inteira fica no retorno da função.
      candidates: result.candidates.slice(0, 50),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível rodar a conciliação.",
      },
      { status: 500 },
    );
  }
}
