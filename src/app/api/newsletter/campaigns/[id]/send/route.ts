import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { sendCampaign } from "@/lib/newsletter";

export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const batchSize = Number(body?.batchSize);

  try {
    const result = await sendCampaign(id, admin.id, {
      batchSize: Number.isFinite(batchSize) ? batchSize : undefined,
    });
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível enviar a campanha." },
      { status: 400 },
    );
  }
}
