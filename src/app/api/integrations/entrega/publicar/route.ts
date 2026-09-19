import { NextRequest, NextResponse } from "next/server";
import { getAdmin, ehDono } from "@/lib/auth";
import { publicarEntrega } from "@/lib/entrega/publicar";
import { verifyServiceJwt } from "@/lib/service-auth";

/**
 * Publica os arquivos da entrega na borda do Cloudflare.
 *
 * É a rota do "aplicar em todos": sem `fqdn` nem `apenas`, ela passa por cada
 * domínio ativo. Para um domínio só, a tela de auditoria usa
 * `/api/integrations/seo-audit/autofix`, que chama o mesmo módulo.
 *
 * Duas diferenças em relação às outras rotas de integração, ambas porque esta
 * escreve na frente do site de cliente:
 *
 * - `ensaio: true` apura tudo e devolve o plano sem enviar nada ao Cloudflare.
 *   É como conferir o que aconteceria antes de mandar publicar.
 * - a varredura em todos os domínios é do dono. Um domínio por vez qualquer
 *   pessoa da equipe aplica — é o mesmo botão da tela de auditoria —, mas
 *   mexer de uma vez na frente de todo cliente da casa não é operação de
 *   rotina.
 */
export async function POST(req: NextRequest) {
  const admin = await getAdmin();
  const service = verifyServiceJwt(req);
  const authHeader = req.headers.get("x-service-key") || req.headers.get("authorization");
  const secretKey = process.env.SERVICE_JWT_SECRET || process.env.SEO_AUDIT_API_KEY;
  const porChave = Boolean(secretKey && authHeader && authHeader.includes(secretKey));

  if (!admin && !service && !porChave) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const ensaio = body?.ensaio === true;
    const apenas = Array.isArray(body?.apenas)
      ? body.apenas.filter((f: unknown): f is string => typeof f === "string" && f.trim().length > 0)
      : typeof body?.fqdn === "string" && body.fqdn.trim()
        ? [body.fqdn.trim()]
        : undefined;

    if (!ensaio && !apenas?.length && admin && !ehDono(admin.role)) {
      return NextResponse.json(
        { error: "Publicar em todos os domínios é do dono. Um domínio por vez está liberado." },
        { status: 403 },
      );
    }

    const result = await publicarEntrega({ apenas, ensaio });
    return NextResponse.json({ success: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
