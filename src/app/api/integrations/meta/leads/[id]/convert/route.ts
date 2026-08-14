import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { convertMetaLeadToCrmLead } from "@/lib/meta";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  }

  const { id } = await params;

  try {
    const lead = await convertMetaLeadToCrmLead({
      actorId: admin.id,
      metaLeadId: id,
    });
    return NextResponse.json({ ok: true, lead });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível converter o lead da Meta.",
      },
      { status: 400 },
    );
  }
}
