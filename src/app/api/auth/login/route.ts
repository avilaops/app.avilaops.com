import { NextResponse } from "next/server";
import { authenticateAdmin, createAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

    const admin = await authenticateAdmin(login, password);
    if (!admin) {
      return NextResponse.json(
        { error: "Acesso não autorizado." },
        { status: 401 },
      );
    }

    await createAdminSession(admin.id);
    await prisma.financeAuditEvent.create({
      data: {
        actorId: admin.id,
        action: "ADMIN_LOGIN",
        entityType: "Session",
      },
    });

    return NextResponse.json({ ok: true });
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
