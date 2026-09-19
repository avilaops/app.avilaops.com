import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { sincronizarInstagram } from "@/lib/instagram";

export const runtime = "nodejs";

/**
 * Relê o perfil do Instagram conectado pelo login próprio.
 *
 * Espelha `/api/integrations/meta/sync`, e de propósito: para quem opera, o
 * gesto é o mesmo nos dois caminhos. O que muda é só de onde o dado vem.
 *
 * Só admin. A rotina diária não passa por aqui: ela renova token, não relê
 * perfil, e misturar as duas faria um erro de leitura de perfil parecer
 * problema de token.
 */
export async function POST(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  }

  let corpo: { organizationId?: unknown } = {};
  try {
    corpo = await request.json();
  } catch {
    corpo = {};
  }
  const organizationId = typeof corpo.organizationId === "string" ? corpo.organizationId : "";
  if (!organizationId) {
    return NextResponse.json({ error: "Cliente não informado." }, { status: 400 });
  }

  try {
    const resultado = await sincronizarInstagram(admin.id, organizationId);
    return NextResponse.json({ ok: true, ...resultado });
  } catch (erro) {
    return NextResponse.json(
      {
        ok: false,
        error:
          erro instanceof Error ? erro.message : "Não foi possível sincronizar o Instagram.",
      },
      { status: 502 },
    );
  }
}
