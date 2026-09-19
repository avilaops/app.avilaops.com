import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { auditarIconesDoDominio } from "@/lib/icones/auditoria";
import { prisma } from "@/lib/prisma";
import { verifyServiceJwt } from "@/lib/service-auth";

/**
 * Auditoria do conjunto de ícones. Sem `fqdn` no corpo, roda em todos os
 * domínios ativos — é como a rotina noturna chama, do mesmo jeito que a de SEO.
 *
 * Os domínios rodam em série de propósito: cada um busca de seis a dez
 * arquivos do site do cliente, e disparar tudo de uma vez transformaria uma
 * conferência em pico de tráfego na infraestrutura de quem estamos auditando.
 */
export async function POST(req: NextRequest) {
  const admin = await getAdmin();
  const service = verifyServiceJwt(req);
  const authHeader = req.headers.get("x-service-key") || req.headers.get("authorization");
  const secretKey = process.env.SERVICE_JWT_SECRET || process.env.SEO_AUDIT_API_KEY;

  const isAuthorized =
    Boolean(admin) || Boolean(service) || (secretKey && authHeader && authHeader.includes(secretKey));

  if (!isAuthorized) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const fqdn = typeof body?.fqdn === "string" ? body.fqdn.trim() : null;

    if (fqdn) {
      const result = await auditarIconesDoDominio(fqdn);
      return NextResponse.json({ success: true, result });
    }

    const dominios = await prisma.domainAsset.findMany({
      where: { status: { not: "ARCHIVED" } },
      select: { fqdn: true },
      orderBy: { fqdn: "asc" },
    });

    const results = [];
    for (const dominio of dominios) {
      results.push(await auditarIconesDoDominio(dominio.fqdn));
    }
    return NextResponse.json({ success: true, count: results.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
