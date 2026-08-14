import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const CLIENTE_PORTAL_URL =
  process.env.CLIENTE_PORTAL_URL ?? "https://cliente.avilaops.com";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  const { id } = await params;

  const req = await prisma.clientRegistrationRequest.findUnique({
    where: { id },
  });

  if (!req) {
    return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });
  }

  if (req.status !== "PENDING") {
    return NextResponse.json(
      { error: "Esta solicitação já foi processada." },
      { status: 409 }
    );
  }

  // ─── Chamar o cliente.avilaops.com para provisionar o cliente ───────────────────
  const serviceSecret = process.env.SERVICE_JWT_SECRET;
  if (!serviceSecret) {
    return NextResponse.json(
      { error: "SERVICE_JWT_SECRET não configurado." },
      { status: 500 }
    );
  }

  // Gera um JWT de serviço de curta duração (5 min)
  const jwt = await import("jsonwebtoken");
  const serviceToken = jwt.default.sign(
    { iss: "app.avilaops.com", sub: "provision-client" },
    serviceSecret,
    { algorithm: "HS256", expiresIn: "5m" }
  );

  const provisionRes = await fetch(
    `${CLIENTE_PORTAL_URL}/api/service/provision-client`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceToken}`,
      },
      body: JSON.stringify({
        nome: req.nome,
        email: req.email,
        cpfCnpj: req.cpfCnpj,
        tipoDocumento: req.tipoDocumento,
        telefone: req.telefone ?? undefined,
        empresa: req.empresa ?? undefined,
      }),
    }
  );

  if (!provisionRes.ok) {
    const body = await provisionRes.text().catch(() => "");
    console.error(
      `[approve] provision-client falhou HTTP ${provisionRes.status}: ${body.slice(0, 300)}`
    );
    return NextResponse.json(
      { error: "Falha ao provisionar o cliente no portal." },
      { status: 502 }
    );
  }

  // ─── Marcar como aprovada ─────────────────────────────────────────────────────
  await prisma.clientRegistrationRequest.update({
    where: { id },
    data: {
      status: "APPROVED",
      revisadoPorId: admin.id,
      revisadoEm: new Date(),
    },
  });

  await prisma.operationsAuditEvent.create({
    data: {
      action: "CLIENT_REGISTRATION_REQUEST_APPROVED",
      entityType: "ClientRegistrationRequest",
      entityId: id,
      actorId: admin.id,
    },
  });

  return NextResponse.json({ ok: true });
}
