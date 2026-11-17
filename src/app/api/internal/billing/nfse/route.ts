import { NextRequest, NextResponse } from "next/server";

import { processarFilaNfse } from "@/lib/fila-nfse";
import { isServiceCall } from "@/lib/service-auth";

export async function POST(request: NextRequest) {
  if (!isServiceCall(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const limit = Number(body?.limit ?? 20);
  return NextResponse.json(await processarFilaNfse(new Date(), Number.isInteger(limit) ? limit : 20));
}
