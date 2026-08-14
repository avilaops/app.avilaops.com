import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { checkDomainAvailability } from "@/lib/domain-availability";
import { cleanText, sameOrigin } from "@/lib/http";

export async function POST(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { domain?: unknown } | null;
  const domain = cleanText(body?.domain, 253);
  if (!domain) {
    return NextResponse.json({ error: "Informe o domínio." }, { status: 400 });
  }

  try {
    const result = await checkDomainAvailability(domain);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível verificar o domínio." },
      { status: 400 },
    );
  }
}
