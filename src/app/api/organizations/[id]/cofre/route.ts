import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { cofreDisponivel, guardarCredencial, resumirCredencial } from "@/lib/cofre";
import { cleanText, sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";

/**
 * Cofre de credenciais do cliente. GET lista sem segredo; POST guarda ou
 * atualiza — o segredo entra uma vez e não volta. Substitui o
 * `scripts/sync-openai-project.ts`: `provider = "openai"` com o projeto em
 * `externalId` é exatamente o que o núcleo de IA lê.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const { id } = await params;
  const lista = await prisma.organizationIntegrationConnection.findMany({
    where: { organizationId: id },
    orderBy: { provider: "asc" },
  });
  return NextResponse.json({ credenciais: lista.map(resumirCredencial), disponivel: cofreDisponivel() });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  if (!cofreDisponivel()) {
    return NextResponse.json({ error: "O cofre está fechado: falta AI_CORE_TOKEN_ENCRYPTION_KEY no servidor." }, { status: 503 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const provider = cleanText(body?.provider, 60).toLowerCase().replace(/[^a-z0-9_.-]/g, "");
  const segredo = typeof body?.segredo === "string" ? body.segredo.trim() : "";
  const accountName = cleanText(body?.accountName, 160) || null;
  const externalId = cleanText(body?.externalId, 160) || null;
  const nota = cleanText(body?.nota, 500) || null;
  const validade = cleanText(body?.validade, 10);

  if (!provider) return NextResponse.json({ error: "Informe o provedor (ex.: openai, cloudflare)." }, { status: 400 });

  const organizacao = await prisma.organization.findUnique({ where: { id }, select: { id: true } });
  if (!organizacao) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

  const existente = await prisma.organizationIntegrationConnection.findUnique({
    where: { organizationId_provider: { organizationId: id, provider } },
    select: { tokenCiphertext: true },
  });
  if (!segredo && !existente?.tokenCiphertext) {
    return NextResponse.json({ error: "Informe o segredo (chave, token ou senha)." }, { status: 400 });
  }

  const credencial = await guardarCredencial({
    organizationId: id,
    provider,
    segredo: segredo || null,
    accountName,
    externalId,
    tokenExpiresAt: /^\d{4}-\d{2}-\d{2}$/.test(validade) ? new Date(`${validade}T12:00:00Z`) : null,
    nota,
  });

  await prisma.operationsAuditEvent.create({
    data: {
      action: existente ? "CREDENTIAL_UPDATED" : "CREDENTIAL_STORED",
      entityType: "OrganizationIntegrationConnection",
      entityId: credencial.id,
      organizationId: id,
      actorId: admin.id,
      metadata: { provider, accountName, externalId, segredoTrocado: Boolean(segredo) },
    },
  });

  return NextResponse.json({ ok: true, credencial: resumirCredencial(credencial) });
}
