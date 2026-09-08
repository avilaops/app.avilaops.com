import { NextRequest, NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { cofreDisponivel } from "@/lib/cofre";
import { sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import {
  removerCertificadoA1,
  salvarCertificadoA1,
} from "@/lib/fiscal/certificado";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!ehDono(admin.role)) {
    return NextResponse.json({ error: "Acesso restrito ao proprietário da conta." }, { status: 403 });
  }

  const { id } = await params;

  const conexao = await prisma.organizationIntegrationConnection.findUnique({
    where: {
      organizationId_provider: {
        organizationId: id,
        provider: "sefaz_certificado_a1",
      },
    },
  });

  if (!conexao) {
    return NextResponse.json({
      cadastrado: false,
      disponivel: cofreDisponivel(),
    });
  }

  const meta = (conexao.metadata as Record<string, unknown>) || {};

  return NextResponse.json({
    cadastrado: true,
    info: meta.info || null,
    ultNSU: meta.ultNSU || "0",
    maxNSU: meta.maxNSU || "0",
    ultimaSincronizacaoEm: meta.ultimaSincronizacaoEm || null,
    bloqueadoAte: meta.bloqueadoAte || null,
    status: conexao.status,
    disponivel: cofreDisponivel(),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!ehDono(admin.role)) {
    return NextResponse.json({ error: "Acesso restrito ao proprietário da conta." }, { status: 403 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }
  if (!cofreDisponivel()) {
    return NextResponse.json(
      { error: "O cofre está indisponível: configure AI_CORE_TOKEN_ENCRYPTION_KEY." },
      { status: 503 }
    );
  }

  const { id } = await params;
  const organizacao = await prisma.organization.findUnique({
    where: { id },
    select: { id: true, cpfCnpj: true, legalName: true },
  });

  if (!organizacao) {
    return NextResponse.json({ error: "Organização não encontrada." }, { status: 404 });
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    let pfxBuffer: Buffer;
    let senha = "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("arquivo") as File | null;
      senha = String(formData.get("senha") || "").trim();

      if (!file) {
        return NextResponse.json(
          { error: "Arquivo de Certificado .pfx não informado." },
          { status: 400 }
        );
      }
      const arrayBuffer = await file.arrayBuffer();
      pfxBuffer = Buffer.from(arrayBuffer);
    } else {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const pfxBase64 = String(body?.pfxBase64 || "").trim();
      senha = String(body?.senha || "").trim();

      if (!pfxBase64) {
        return NextResponse.json(
          { error: "Conteúdo do certificado em base64 não informado." },
          { status: 400 }
        );
      }
      pfxBuffer = Buffer.from(pfxBase64, "base64");
    }

    if (!senha) {
      return NextResponse.json(
        { error: "A senha do Certificado Digital é obrigatória." },
        { status: 400 }
      );
    }

    const info = await salvarCertificadoA1({
      organizationId: id,
      pfxBuffer,
      senha,
      cnpj: organizacao.cpfCnpj,
    });

    await prisma.operationsAuditEvent.create({
      data: {
        action: "CERTIFICADO_A1_ATUALIZADO",
        entityType: "OrganizationIntegrationConnection",
        entityId: id,
        organizationId: id,
        actorId: admin.id,
        metadata: {
          cnpj: info.cnpj,
          razaoSocial: info.razaoSocial,
          validoAte: info.validoAte,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      mensagem: "Certificado Digital A1 validado e armazenado com sucesso!",
      info,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Falha ao processar certificado.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!ehDono(admin.role)) {
    return NextResponse.json({ error: "Acesso restrito ao proprietário da conta." }, { status: 403 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  const { id } = await params;
  await removerCertificadoA1(id);

  await prisma.operationsAuditEvent.create({
    data: {
      action: "CERTIFICADO_A1_REMOVIDO",
      entityType: "OrganizationIntegrationConnection",
      entityId: id,
      organizationId: id,
      actorId: admin.id,
      metadata: { provider: "sefaz_certificado_a1" },
    },
  });

  return NextResponse.json({ ok: true, mensagem: "Certificado Digital A1 removido." });
}
