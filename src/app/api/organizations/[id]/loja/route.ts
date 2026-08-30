import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { cleanText, sameOrigin } from "@/lib/http";
import { chamarN8n, N8nIndisponivel } from "@/lib/n8n";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";

type ResultadoLoja = {
  ok: boolean;
  status: number;
  slug: string;
  url: string | null;
  situacao: string | null;
  provisionamento: Record<string, unknown> | null;
  erro: string | null;
  detalhes: unknown;
};

/**
 * "Criar loja" na ficha: o n8n ("Ávila OS — Criar loja") cria o tenant na
 * plataforma de lojas e já provisiona DNS + e-mail. A plataforma continua
 * dona do estado da loja; aqui só fica o vínculo (slug + URL) na ficha.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  const organizacao = await prisma.organization.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      legalName: true,
      cpfCnpj: true,
      contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1 },
      organizationIntegrations: { where: { provider: "lojas_avilaops" }, select: { publicId: true, url: true } },
    },
  });
  if (!organizacao) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  if (organizacao.organizationIntegrations[0]?.publicId) {
    return NextResponse.json(
      { error: `Este cliente já tem a loja "${organizacao.organizationIntegrations[0].publicId}".` },
      { status: 409 },
    );
  }

  const slug = slugify(cleanText(body?.slug, 60) || organizacao.slug, 60);
  const nome = cleanText(body?.nome, 80) || organizacao.name;
  const plano = cleanText(body?.plano, 12).toUpperCase();
  const contato = organizacao.contacts[0];
  const cnpj = (organizacao.cpfCnpj ?? "").replace(/\D/g, "");

  let resultado: ResultadoLoja;
  try {
    resultado = await chamarN8n<ResultadoLoja>(
      "avila-os-loja",
      {
        slug,
        nome,
        plano: ["SITE", "LOJA", "LOJA_PRO"].includes(plano) ? plano : "LOJA",
        dominioPrincipal: cleanText(body?.dominioPrincipal, 253).toLowerCase(),
        emailContato: cleanText(body?.emailContato, 160).toLowerCase() || contato?.email || "",
        whatsapp: cleanText(body?.whatsapp, 30) || contato?.whatsapp || contato?.phone || "",
        razaoSocial: organizacao.legalName ?? "",
        cnpj: cnpj.length === 14 ? cnpj : "",
        provisionar: "sim",
        organizationId: organizacao.id,
        autor: admin.email ?? admin.nome,
      },
      { timeoutMs: 150_000 },
    );
  } catch (erro) {
    return NextResponse.json(
      { error: erro instanceof N8nIndisponivel ? erro.message : "Falha ao acionar o n8n." },
      { status: 502 },
    );
  }

  if (!resultado?.ok) {
    return NextResponse.json(
      { error: resultado?.erro || "A plataforma de lojas recusou a criação.", detalhes: resultado?.detalhes ?? null },
      { status: 409 },
    );
  }

  await prisma.organizationIntegration.upsert({
    where: { organizationId_provider: { organizationId: organizacao.id, provider: "lojas_avilaops" } },
    create: {
      organizationId: organizacao.id,
      provider: "lojas_avilaops",
      publicId: resultado.slug,
      accountName: nome,
      url: resultado.url,
      status: "ACTIVE",
      notes: resultado.situacao ? `Situação na plataforma: ${resultado.situacao}` : null,
    },
    update: { publicId: resultado.slug, url: resultado.url, status: "ACTIVE" },
  });

  await prisma.operationsAuditEvent.create({
    data: {
      action: "STORE_PROVISIONED",
      entityType: "Organization",
      entityId: organizacao.id,
      organizationId: organizacao.id,
      actorId: admin.id,
      metadata: {
        slug: resultado.slug,
        url: resultado.url,
        situacao: resultado.situacao,
        provisionamento: JSON.parse(JSON.stringify(resultado.provisionamento ?? null)),
      },
    },
  });

  return NextResponse.json({ ...resultado, ok: true });
}
