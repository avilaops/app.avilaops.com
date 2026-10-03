import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getAdmin } from "@/lib/auth";
import { cleanText, sameOrigin } from "@/lib/http";
import { classifyCpfCnpj } from "@/lib/cpf-cnpj";
import { ehDominioValido, normalizeDomainInput } from "@/lib/dominio";
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
    perfil?: Record<string, unknown> | null;
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

  // Contato, inscrições e endereço que vieram de uma ficha cadastral em PDF e
  // passaram pela conferência no formulário. Ausente no cadastro digitado.
  const perfilBruto =
    body?.perfil && typeof body.perfil === "object" ? body.perfil : null;
  const campoDoPerfil = (nome: string, tamanho: number) =>
    perfilBruto ? cleanText(perfilBruto[nome], tamanho) || null : null;
  const perfil = perfilBruto
    ? {
        stateRegistration: campoDoPerfil("stateRegistration", 80),
        municipalRegistration: campoDoPerfil("municipalRegistration", 80),
        ownerName: campoDoPerfil("ownerName", 160),
        phone: campoDoPerfil("phone", 60),
        whatsapp: campoDoPerfil("whatsapp", 60),
        email: campoDoPerfil("email", 160),
        postalCode: campoDoPerfil("postalCode", 20),
        street: campoDoPerfil("street", 180),
        number: campoDoPerfil("number", 40),
        complement: campoDoPerfil("complement", 120),
        district: campoDoPerfil("district", 120),
        city: campoDoPerfil("city", 120),
        state: campoDoPerfil("state", 60),
      }
    : null;

  if (perfil?.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(perfil.email)) {
    return NextResponse.json({ error: "E-mail da ficha inválido." }, { status: 400 });
  }

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
    cpfCnpj = classified.documento;

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

  // O campo pede domínio, mas o que se cola é URL: "https://www.empresa.com.br/"
  // era gravado assim e não casava com o mesmo domínio em nenhum outro lugar
  // (Lojas, e-mail, Cloudflare). Guarda só o host. Vazio, vem do site atual.
  const primaryDomain = hasCurrentSite
    ? normalizeDomainInput(currentSiteDomain) ||
      (siteUrl ? normalizeDomainInput(new URL(siteUrl).hostname) : "")
    : "";
  if (primaryDomain && !ehDominioValido(primaryDomain)) {
    return NextResponse.json(
      { error: "Domínio principal inválido. Use algo como empresa.com.br." },
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
  // Sem `INTERNAL_SITE_BASE_URL` a página interna não tem onde responder, então
  // o cadastro nasce em rascunho em vez de nascer "no ar" com endereço nenhum.
  const internalUrl = internalSiteUrl(slug);
  const internalSitePublishedAt = internalUrl ? new Date() : null;

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
            hasDomain: hasCurrentSite ? Boolean(primaryDomain) : false,
            primaryDomain: primaryDomain || null,
            siteProvider: siteProvider || null,
            accessStatus: siteAccessStatus || null,
            siteNotes: siteNotes || null,
            wantsCustomDomain: hasCurrentSite ? false : wantsCustomDomain,
            internalSubdomain: slug,
            internalUrl,
            // Com host configurado a página interna entra no ar já no
            // cadastro, porque a página pública filtra por PUBLISHED e
            // devolveria 404 enquanto ficasse em DRAFT.
            internalSiteStatus: internalUrl ? "PUBLISHED" : "DRAFT",
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

    if (perfil && Object.values(perfil).some(Boolean)) {
      await transaction.organizationProfile.create({
        data: { organizationId: created.id, ...perfil, country: "Brasil" },
      });

      if ([perfil.postalCode, perfil.street, perfil.city, perfil.state].some(Boolean)) {
        await transaction.organizationAddress.create({
          data: {
            organizationId: created.id,
            type: "MAIN",
            postalCode: perfil.postalCode,
            street: perfil.street,
            number: perfil.number,
            complement: perfil.complement,
            district: perfil.district,
            city: perfil.city,
            state: perfil.state,
            country: "Brasil",
            source: "FICHA_PDF",
            isPrimary: true,
          },
        });
      }

      if (perfil.ownerName) {
        await transaction.organizationContact.create({
          data: {
            organizationId: created.id,
            type: "OWNER",
            name: perfil.ownerName,
            phone: perfil.phone,
            whatsapp: perfil.whatsapp,
            email: perfil.email,
            isPrimary: true,
          },
        });
      }
    }

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
          origemDados: perfil ? "FICHA_PDF" : "DIGITADO",
          hasCurrentSite,
          selectedDomainPlanSlug: selectedDomainPlanSlug || null,
          internalUrl,
        },
      },
    });

    if (created.webPresence && internalUrl) {
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
