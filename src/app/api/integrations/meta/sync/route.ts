import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { syncMetaBusiness } from "@/lib/meta";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  }

  let body: { organizationId?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  if (!organizationId) {
    return NextResponse.json({ error: "Cliente não informado." }, { status: 400 });
  }

  try {
    const result = await syncMetaBusiness(admin.id, organizationId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível sincronizar a Meta.",
      },
      { status: 502 },
    );
  }
}
