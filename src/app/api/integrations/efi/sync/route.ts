import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { runEfiSync } from "@/lib/sync";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const admin = await getAdmin();
  if (!admin) {
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
    const result = await runEfiSync({ actorId: admin.id, days });
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
