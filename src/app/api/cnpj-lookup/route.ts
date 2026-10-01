import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { isValidCnpj, normalizarDocumento } from "@/lib/cpf-cnpj";
import { lookupCnpj } from "@/lib/cnpj-lookup";

export async function GET(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  const cnpj = normalizarDocumento(request.nextUrl.searchParams.get("cnpj") ?? "");
  if (!isValidCnpj(cnpj)) {
    return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });
  }

  try {
    const data = await lookupCnpj(cnpj);
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível consultar o CNPJ.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
