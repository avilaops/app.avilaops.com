import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getAdmin } from "@/lib/auth";
import { cleanText, sameOrigin } from "@/lib/http";
import { classifyCpfCnpj } from "@/lib/cpf-cnpj";
import { internalSiteSlug, internalSiteUrl } from "@/lib/internal-site";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    legalName?: unknown;
    segment?: unknown;
    hasCurrentSite?: unknown;
    siteUrl?: unknown;
    currentSiteDomain?: unknown;
    siteProvider?: unknown;
    siteAccessStatus?: unknown;
    siteNotes?: unknown;
    wantsCustomDomain?: unknown;
    selectedDomainPlanSlug?: unknown;
    desiredDomain?: unknown;
    preferredExtension?: unknown;
    alternativeDomains?: unknown;
    domainAvailabilityStatus?: unknown;
    cpfCnpj?: unknown;
    cnpjData?: unknown;
  } | null;

  const name = cleanText(body?.name, 120);
  const legalName = cleanText(body?.legalName, 160);
  const segment = cleanText(body?.segment, 80);
  const hasCurrentSiteValue = cleanText(body?.hasCurrentSite, 8);
  const siteUrlValue = cleanText(body?.siteUrl, 300);
  const currentSiteDomain = cleanText(body?.currentSiteDomain, 160);
  const siteProvider = cleanText(body?.siteProvider, 120);
  const siteAccessStatus = cleanText(body?.siteAccessStatus, 40);
  const siteNotes = cleanText(body?.siteNotes, 500);
  const wantsCustomDomain = body?.wantsCustomDomain === true;
  const selectedDomainPlanSlug =
    cleanText(body?.selectedDomainPlanSlug, 80) || "domain-none";
  const desiredDomain = cleanText(body?.desiredDomain, 160);
  const preferredExtension = cleanText(body?.preferredExtension, 30);
  const alternativeDomains = cleanText(body?.alternativeDomains, 500);
  const domainAvailabilityStatus =
    cleanText(body?.domainAvailabilityStatus, 40) || "NOT_CHECKED";
  const cpfCnpjValue = cleanText(body?.cpfCnpj, 18);

  if (name.length < 2) {
    return NextResponse.json(
      { error: "Informe o nome da empresa." },
      { status: 400 },
    );
  }

  if (!["YES", "NO"].includes(hasCurrentSiteValue)) {
    return NextResponse.json(
      { error: "Informe se a empresa possui site atual." },
      { status: 400 },
    );
  }

  const hasCurrentSite = hasCurrentSiteValue === "YES";

  let cpfCnpj: string | null = null;
  if (cpfCnpjValue) {
    const classified = classifyCpfCnpj(cpfCnpjValue);
    if (!classified || !classified.valid) {
      return NextResponse.json(
        { error: "CPF ou CNPJ inválido." },
        { status: 400 },
      );
    }
    cpfCnpj = classified.digits;

    const existing = await prisma.organization.findUnique({ where: { cpfCnpj } });
    if (existing) {
      return NextResponse.json(
        { error: "Já existe uma organização cadastrada com esse CPF/CNPJ." },
        { status: 409 },
      );
    }
  }

  // cnpjData só é aceito quando o CNPJ enviado bate com o que o cliente
  // consultou via /api/cnpj-lookup — evita gravar um payload arbitrário do
  // corpo da requisição sem relação com o cpfCnpj validado acima.
  const cnpjData: Prisma.InputJsonValue | null =
    cpfCnpj &&
    cpfCnpj.length === 14 &&
    body?.cnpjData &&
    typeof body.cnpjData === "object"
      ? (body.cnpjData as Prisma.InputJsonValue)
      : null;

  let siteUrl: string | null = null;
  if (siteUrlValue) {
    try {
      const parsed = new URL(siteUrlValue);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      siteUrl = parsed.toString();
    } catch {
      return NextResponse.json(
        { error: "Informe uma URL válida, incluindo https://." },
        { status: 400 },
      );
    }
  }

  if (hasCurrentSite && !siteUrl) {
    return NextResponse.json(
      { error: "Informe a URL do site atual." },
      { status: 400 },
    );
  }

  if (!hasCurrentSite && wantsCustomDomain && selectedDomainPlanSlug === "domain-none") {
    return NextResponse.json(
      { error: "Selecione um plano de domínio ou a opção sem domínio." },
      { status: 400 },
    );
  }

  const slugBase = internalSiteSlug(name) || "cliente";
  const matchingSlugs = await prisma.organization.findMany({
    where: { slug: { startsWith: slugBase } },
    select: { slug: true },
  });
  const usedSlugs = new Set(matchingSlugs.map((item) => item.slug));
  let slug = slugBase;
  let suffix = 2;
  while (usedSlugs.has(slug)) {
    slug = `${slugBase.slice(0, 58)}-${suffix}`;
    suffix += 1;
  }
  const internalUrl = internalSiteUrl(slug);
  const internalSitePublishedAt = new Date();

  const organization = await prisma.$transaction(async (transaction) => {
    const created = await transaction.organization.create({
      data: {
        name,
        slug,
        legalName: legalName || null,
        cpfCnpj,
        cnpjData: cnpjData ?? undefined,
        segment: segment || null,
        siteUrl,
        status: "ONBOARDING",
        brands: {
          create: {
            name,
            slug: "principal",
            siteUrl,
          },
        },
        webPresence: {
          create: {
            hasCurrentSite,
            currentSiteUrl: siteUrl,
            hasDomain: hasCurrentSite ? Boolean(currentSiteDomain || siteUrl) : false,
            primaryDomain: currentSiteDomain || null,
            siteProvider: siteProvider || null,
            accessStatus: siteAccessStatus || null,
            siteNotes: siteNotes || null,
            wantsCustomDomain: hasCurrentSite ? false : wantsCustomDomain,
            internalSubdomain: slug,
            internalUrl,
            // A página interna entra no ar já no cadastro; a página pública
            // filtra por PUBLISHED e devolveria 404 enquanto ficasse em DRAFT.
            internalSiteStatus: "PUBLISHED",
            internalSitePublishedAt,
            selectedDomainPlanSlug:
              !hasCurrentSite && (wantsCustomDomain || selectedDomainPlanSlug === "domain-none")
                ? selectedDomainPlanSlug
                : null,
            desiredDomain: desiredDomain || null,
            preferredExtension: preferredExtension || null,
            alternativeDomains: alternativeDomains || null,
            domainAvailabilityStatus,
          },
        },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        webPresence: { select: { id: true } },
      },
    });

    if (!hasCurrentSite && (wantsCustomDomain || selectedDomainPlanSlug === "domain-none")) {
      const plan = await transaction.servicePlan.findUnique({
        where: { slug: selectedDomainPlanSlug },
        select: { id: true, slug: true },
      });

      await transaction.organizationServiceOpportunity.create({
        data: {
          organizationId: created.id,
          serviceType: "DOMAIN",
          currentSituation: "Cliente sem site atual no cadastro rápido.",
          interestStatus:
            selectedDomainPlanSlug === "domain-none" ? "NO_DOMAIN_NOW" : "INTERESTED",
          planId: plan?.id,
          commercialStatus:
            selectedDomainPlanSlug === "domain-none" ? "NOT_APPLICABLE" : "OFFER_RECOMMENDED",
          notes:
            selectedDomainPlanSlug === "domain-none"
              ? "Cliente informou que não irá utilizar domínio no momento."
              : "Plano de domínio selecionado no cadastro rápido. Confirmar disponibilidade e preço real antes da contratação.",
          nextAction:
            selectedDomainPlanSlug === "domain-none"
              ? "Revisar necessidade de domínio em etapa futura."
              : "Verificar disponibilidade do domínio desejado.",
        },
      });
    }

    await transaction.operationsAuditEvent.create({
      data: {
        actorId: admin.id,
        organizationId: created.id,
        action: "ORGANIZATION_CREATED",
        entityType: "Organization",
        entityId: created.id,
        metadata: {
          source: "app.avilaops.com",
          hasCurrentSite,
          selectedDomainPlanSlug: selectedDomainPlanSlug || null,
          internalUrl,
        },
      },
    });

    if (created.webPresence) {
      await transaction.operationsAuditEvent.create({
        data: {
          actorId: admin.id,
          organizationId: created.id,
          action: "ORGANIZATION_INTERNAL_SITE_PUBLISHED",
          entityType: "OrganizationWebPresence",
          entityId: created.webPresence.id,
          metadata: { internalUrl, internalSubdomain: slug, source: "ORGANIZATION_CREATED" },
        },
      });
    }

    return {
      id: created.id,
      name: created.name,
      slug: created.slug,
      status: created.status,
    };
  });

  return NextResponse.json({ organization }, { status: 201 });
}
