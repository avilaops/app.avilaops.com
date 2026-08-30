import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { cleanText, sameOrigin } from "@/lib/http";
import { chamarN8n, N8nIndisponivel } from "@/lib/n8n";
import { prisma } from "@/lib/prisma";

/**
 * "Configurar Google" na ficha: GA4 + GTM + Search Console + sitemap +
 * indexação, pelo n8n ("Ávila OS — Google do cliente"). Demora 1 a 3 min,
 * então o n8n responde 202 e devolve o resultado em
 * `POST /api/webhooks/n8n/google` quando termina. Aqui só marcamos "em
 * andamento".
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
      siteUrl: true,
      domains: { orderBy: { createdAt: "asc" }, select: { fqdn: true } },
      organizationIntegrations: { where: { provider: "meta_pixel" }, select: { publicId: true } },
    },
  });
  if (!organizacao) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

  const dominioPedido = cleanText(body?.dominio, 253).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const dominioSite = organizacao.siteUrl
    ? organizacao.siteUrl.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")
    : "";
  const dominio = dominioPedido || organizacao.domains[0]?.fqdn || dominioSite;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(dominio)) {
    return NextResponse.json({ error: "Informe o domínio do site (ou adicione um domínio ao cliente)." }, { status: 400 });
  }

  const appUrl = (process.env.APP_URL ?? process.env.APP_BASE_URL ?? "https://app.avilaops.com").replace(/\/+$/, "");
  const payload = {
    empresa: organizacao.name,
    dominio,
    donoEmail: cleanText(body?.donoEmail, 160).toLowerCase(),
    pixelId: cleanText(body?.pixelId, 32).replace(/\D/g, "") || organizacao.organizationIntegrations[0]?.publicId?.replace(/\D/g, "") || "",
    sitemap: cleanText(body?.sitemap, 300),
    indexar: cleanText(body?.indexar, 8) === "nao" ? "Não" : "Sim",
    myBusiness: cleanText(body?.myBusiness, 8) === "sim" ? "Criar" : "Não precisa",
    organizationId: organizacao.id,
    callbackUrl: `${appUrl}/api/webhooks/n8n/google`,
    autor: admin.email ?? admin.nome,
  };

  try {
    await chamarN8n("avila-os-google", payload, { timeoutMs: 30_000 });
  } catch (erro) {
    return NextResponse.json(
      { error: erro instanceof N8nIndisponivel ? erro.message : "Falha ao acionar o n8n." },
      { status: 502 },
    );
  }

  const nota = `Iniciado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} para ${dominio}. O n8n grava o resultado quando terminar (1–3 min).`;
  await prisma.organizationIntegration.upsert({
    where: { organizationId_provider: { organizationId: organizacao.id, provider: "google_onboarding" } },
    create: { organizationId: organizacao.id, provider: "google_onboarding", publicId: dominio, status: "PENDING", notes: nota },
    update: { publicId: dominio, status: "PENDING", notes: nota },
  });

  await prisma.operationsAuditEvent.create({
    data: {
      action: "GOOGLE_ONBOARDING_STARTED",
      entityType: "Organization",
      entityId: organizacao.id,
      organizationId: organizacao.id,
      actorId: admin.id,
      metadata: { dominio, donoEmail: payload.donoEmail, indexar: payload.indexar, myBusiness: payload.myBusiness },
    },
  });

  return NextResponse.json({ ok: true, aceito: true, dominio });
}
