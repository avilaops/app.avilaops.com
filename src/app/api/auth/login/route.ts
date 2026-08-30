import { NextResponse } from "next/server";
import { autenticarPortal, createAdminSession, destinoPorPapel, ehDaCasa, type PapelPortal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Porta única do portal.
 *
 * Equipe e cliente entram pelo mesmo formulário, contra a mesma tabela
 * (`portal_clients`). O papel não decide *se* entra — decide *para onde vai*:
 * ADMIN cai na operação, CLIENT na área do cliente. As rotas administrativas
 * seguem protegidas por `getAdmin()`, que continua exigindo ADMIN.
 */

export async function POST(request: Request) {
  try {
    let body: {
      login?: unknown;
      password?: unknown;
    };

    try {
      body = (await request.json()) as {
        login?: unknown;
        password?: unknown;
      };
    } catch {
      return NextResponse.json(
        { error: "Informe credenciais válidas." },
        { status: 400 },
      );
    }

    const login = typeof body.login === "string" ? body.login.trim() : "";
    const password =
      typeof body.password === "string" ? body.password : "";

    if (!login || password.length < 6 || password.length > 200) {
      return NextResponse.json(
        { error: "Informe credenciais válidas." },
        { status: 400 },
      );
    }

    const identidade = await autenticarPortal(login, password);
    if (!identidade) {
      return NextResponse.json(
        { error: "Acesso não autorizado." },
        { status: 401 },
      );
    }

    // O papel vem do banco e é preservado como está: comparar com "ADMIN" solto
    // rebaixaria o OWNER a cliente e trancaria o dono para fora do painel.
    const papel: PapelPortal = ehDaCasa(identidade.role) ? (identidade.role as PapelPortal) : "CLIENT";

    await createAdminSession(identidade.id, papel);
    await prisma.financeAuditEvent.create({
      data: {
        actorId: identidade.id,
        action: `${papel}_LOGIN`,
        entityType: "Session",
      },
    });

    return NextResponse.json({ ok: true, destino: destinoPorPapel(papel) });
  } catch (error) {
    if (error instanceof Error && error.message === "PROVISIONAL_PASSWORD") {
      return NextResponse.json(
        { error: "Troque a senha provisória no portal antes de acessar." },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: "Não foi possível validar o acesso." },
      { status: 500 },
    );
  }
}
