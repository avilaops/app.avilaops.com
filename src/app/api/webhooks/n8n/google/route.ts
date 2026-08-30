import { NextRequest, NextResponse } from "next/server";
import { cleanText } from "@/lib/http";
import { marcarEtapa } from "@/lib/onboarding-etapas";
import { prisma } from "@/lib/prisma";
import { isServiceCall } from "@/lib/service-auth";

/**
 * Retorno do n8n ("Ávila OS — Google do cliente") com o resultado do
 * onboarding: IDs do GA4 e do GTM, situação do Search Console e pendências.
 * Autenticado pelo header `x-service-key`. Grava em `OrganizationIntegration`,
 * que é o que a aba "Analytics e integrações" da ficha já lê.
 */
export async function POST(request: NextRequest) {
  if (!isServiceCall(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const organizationId = cleanText(body?.organizationId, 64);
  const dominio = cleanText(body?.dominio, 253).toLowerCase();
  if (!organizationId) {
    return NextResponse.json({ error: "organizationId ausente." }, { status: 400 });
  }

  const organizacao = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
  if (!organizacao) {
    return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  }

  const status = cleanText(body?.status, 40) || "ok";
  const ga4PropertyId = cleanText(body?.ga4PropertyId, 64);
  const ga4MeasurementId = cleanText(body?.ga4MeasurementId, 64);
  const gtmContainerId = cleanText(body?.gtmContainerId, 64);
  const gtmPublicId = cleanText(body?.gtmPublicId, 64);
  const searchConsole = cleanText(body?.searchConsole, 500);
  const indexacao = cleanText(body?.indexacao, 500);
  const pendencias = cleanText(body?.pendencias, 2000);

  const gravar = (provider: string, dados: { publicId?: string | null; accountName?: string | null; url?: string | null; status: string; notes?: string | null }) =>
    prisma.organizationIntegration.upsert({
      where: { organizationId_provider: { organizationId, provider } },
      create: { organizationId, provider, ...dados },
      update: dados,
    });

  const gravacoes: Promise<unknown>[] = [];
  if (ga4MeasurementId || ga4PropertyId) {
    gravacoes.push(
      gravar("google_analytics_4", {
        publicId: ga4MeasurementId || null,
        accountName: ga4PropertyId ? `Propriedade ${ga4PropertyId}` : null,
        url: ga4PropertyId ? `https://analytics.google.com/analytics/web/#/p${ga4PropertyId}/reports/intro` : null,
        status: "ACTIVE",
        notes: "Criado pelo n8n (Google — onboarding de cliente)",
      }),
    );
  }
  if (gtmPublicId || gtmContainerId) {
    gravacoes.push(
      gravar("google_tag_manager", {
        publicId: gtmPublicId || null,
        accountName: gtmContainerId ? `Container ${gtmContainerId}` : null,
        url: gtmContainerId ? `https://tagmanager.google.com/#/container/accounts/6362126826/containers/${gtmContainerId}` : null,
        status: "ACTIVE",
        notes: "Publicado pelo n8n com a Google tag" + (cleanText(body?.pixelId, 32) ? " e o Meta Pixel" : ""),
      }),
    );
  }
  if (dominio) {
    const verificado = /verificad/i.test(searchConsole) && !/pendente|não/i.test(searchConsole);
    gravacoes.push(
      gravar("google_search_console", {
        publicId: `sc-domain:${dominio}`,
        url: `https://search.google.com/search-console?resource_id=sc-domain:${dominio}`,
        status: verificado ? "ACTIVE" : "PENDING",
        notes: [searchConsole, indexacao ? `Indexação: ${indexacao}` : ""].filter(Boolean).join(" · ") || null,
      }),
    );
  }
  gravacoes.push(
    gravar("google_onboarding", {
      publicId: dominio || null,
      status: status === "falhou" ? "FAILED" : status === "ok" ? "ACTIVE" : "ATTENTION",
      notes: pendencias || `Concluído em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
    }),
  );
  await Promise.all(gravacoes);

  if (status !== "falhou") {
    await marcarEtapa(organizationId, "GOOGLE", [ga4MeasurementId && `GA4 ${ga4MeasurementId}`, gtmPublicId && `GTM ${gtmPublicId}`, searchConsole].filter(Boolean).join(" · "));
  }

  await prisma.operationsAuditEvent.create({
    data: {
      action: "GOOGLE_ONBOARDING_FINISHED",
      entityType: "Organization",
      entityId: organizationId,
      organizationId,
      actorId: "servico:n8n",
      metadata: { dominio, status, ga4MeasurementId, gtmPublicId, searchConsole, pendencias },
    },
  });

  return NextResponse.json({ ok: true });
}
