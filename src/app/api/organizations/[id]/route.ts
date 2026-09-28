import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAdmin } from "@/lib/auth";
import { lookupCnpj } from "@/lib/cnpj-lookup";
import { classifyCpfCnpj, isValidCpf, onlyDigits } from "@/lib/cpf-cnpj";
import { cleanText, sameOrigin } from "@/lib/http";
import { internalSiteUrl, resolveInternalSubdomain } from "@/lib/internal-site";
import { prisma } from "@/lib/prisma";

function optional(value: unknown, max = 500) {
  const text = cleanText(value, max);
  return text || null;
}

function booleanFromSelect(value: unknown) {
  const text = cleanText(value, 8);
  if (text === "YES") return true;
  if (text === "NO") return false;
  return null;
}

function parseSeoKeywords(value: unknown) {
  if (typeof value !== "string") return null;
  const text = cleanText(value, 5000);
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 80)
    .map((line) => {
      const [keyword, intent, locality, priority, recommendedPage] = line
        .split("|")
        .map((part) => part.trim());
      return {
        keyword: keyword.slice(0, 180),
        intent: intent?.slice(0, 80) || null,
        locality: locality?.slice(0, 80) || null,
        priority: priority?.slice(0, 30) || "MEDIUM",
        recommendedPage: recommendedPage?.slice(0, 200) || null,
      };
    })
    .filter((item) => item.keyword.length >= 2);
}

function parseBrandAssets(value: unknown) {
  if (typeof value !== "string") return null;
  const text = cleanText(value, 5000);
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 80)
    .map((line) => {
      const [assetType, name, url, format, dimensions, version, notes] = line
        .split("|")
        .map((part) => part.trim());
      return {
        assetType: (assetType || "Outros arquivos").slice(0, 80),
        name: name?.slice(0, 160) || null,
        url: url?.slice(0, 500) || null,
        format: format?.slice(0, 40) || null,
        dimensions: dimensions?.slice(0, 60) || null,
        version: version?.slice(0, 40) || "1",
        notes: notes?.slice(0, 500) || null,
      };
    });
}

function integrationRows(organizationId: string, integrations: Record<string, unknown>) {
  const providers = [
    ["google_analytics_4", integrations.ga4],
    ["google_tag_manager", integrations.gtm],
    ["google_search_console", integrations.searchConsole],
    ["meta_pixel", integrations.metaPixel],
    ["meta_business", integrations.metaBusiness],
    ["google_ads", integrations.googleAds],
    ["whatsapp_business", integrations.whatsappBusiness],
    ["transactional_email", integrations.transactionalEmail],
  ] as const;

  return providers
    .map(([provider, publicId]) => ({
      organizationId,
      provider,
      publicId: optional(publicId, 180),
      status: optional(publicId, 180) ? "CONFIGURED" : "PENDING",
    }))
    .filter((item) => item.publicId);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    organization?: Record<string, unknown>;
    profile?: Record<string, unknown>;
    primaryContact?: Record<string, unknown>;
    primaryAddress?: Record<string, unknown>;
    webPresence?: Record<string, unknown>;
    socialProfiles?: Record<string, Record<string, unknown>>;
    onboardingSteps?: Array<Record<string, unknown>>;
    seoKeywordsText?: unknown;
    brandAssetsText?: unknown;
    integrations?: Record<string, unknown>;
    opportunities?: Record<string, unknown>;
  } | null;

  const organization = await prisma.organization.findUnique({
    where: { id },
    select: { id: true, slug: true, cpfCnpj: true },
  });
  if (!organization) {
    return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  }

  const orgBody = body?.organization ?? {};
  const profile = body?.profile ?? {};
  const primaryContact = body?.primaryContact ?? {};
  const primaryAddress = body?.primaryAddress ?? {};
  const web = body?.webPresence ?? {};
  const socialProfiles = body?.socialProfiles ?? {};
  const onboardingSteps = Array.isArray(body?.onboardingSteps) ? body.onboardingSteps : [];
  const opportunities = body?.opportunities ?? {};
  const seoKeywords = parseSeoKeywords(body?.seoKeywordsText);
  const brandAssets = parseBrandAssets(body?.brandAssetsText);
  const integrations = integrationRows(id, body?.integrations ?? {});

  const name = optional(orgBody.name, 120);
  if (!name || name.length < 2) {
    return NextResponse.json({ error: "Informe o nome fantasia." }, { status: 400 });
  }

  // CPF/CNPJ só entrava na criação do cliente: quem nasceu sem ele ficava sem
  // para sempre, e com isso o "Preencher pela Receita" do assistente morria
  // desativado. Agora a ficha aceita, e o CNPJ novo é consultado aqui no
  // servidor; o retrato da Receita nunca vem do corpo da requisição.
  let documento: { cpfCnpj: string | null; cnpjData: Prisma.InputJsonValue | typeof Prisma.DbNull } | null = null;
  let aviso: string | undefined;
  if (orgBody.cpfCnpj !== undefined) {
    const texto = cleanText(orgBody.cpfCnpj, 18);
    const digitos = texto ? onlyDigits(texto) : "";
    if (digitos !== (organization.cpfCnpj ?? "")) {
      if (!digitos) {
        documento = { cpfCnpj: null, cnpjData: Prisma.DbNull };
      } else {
        const classificado = classifyCpfCnpj(digitos);
        if (!classificado || !classificado.valid) {
          return NextResponse.json({ error: "CPF ou CNPJ inválido." }, { status: 400 });
        }
        const outro = await prisma.organization.findUnique({
          where: { cpfCnpj: classificado.digits },
          select: { name: true },
        });
        if (outro) {
          return NextResponse.json(
            { error: `Esse CPF/CNPJ já está no cadastro de ${outro.name}.` },
            { status: 409 },
          );
        }
        let cnpjData: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
        if (classificado.kind === "CNPJ") {
          try {
            cnpjData = (await lookupCnpj(classificado.digits)) as Prisma.InputJsonValue;
          } catch (erro) {
            // O documento é válido e vale gravar mesmo sem a Receita
            // responder; o assistente só não terá o que preencher até a
            // próxima troca. A pessoa precisa saber disso, não descobrir.
            aviso = `O CNPJ foi gravado, mas a consulta à Receita falhou (${erro instanceof Error ? erro.message : "erro desconhecido"}).`;
          }
        }
        documento = { cpfCnpj: classificado.digits, cnpjData };
      }
    }
  }

  const responsibleCpfTexto = cleanText(profile.responsibleCpf, 20);
  const responsibleCpf = responsibleCpfTexto ? onlyDigits(responsibleCpfTexto) : null;
  if (responsibleCpf && !isValidCpf(responsibleCpf)) {
    return NextResponse.json({ error: "CPF do responsável inválido." }, { status: 400 });
  }

  // O endereço interno é sempre derivado do subdomínio, nunca digitado: quem
  // preenche o dossiê não precisa saber montar a URL nem mantê-la em sincronia.
  const internalSubdomain = resolveInternalSubdomain(
    cleanText(web.internalSubdomain, 120),
    organization.slug,
    name,
  );
  const internalUrl = internalSubdomain ? internalSiteUrl(internalSubdomain) : null;

  // Não há restrição de unicidade no banco e a página pública resolve o slug com
  // LIMIT 1: sem esta checagem, repetir o subdomínio faria um cliente aparecer
  // no endereço do outro, sem erro nenhum.
  if (internalSubdomain) {
    const emUso = await prisma.organizationWebPresence.findFirst({
      where: { internalSubdomain, organizationId: { not: id } },
      select: { organization: { select: { name: true } } },
    });
    if (emUso) {
      return NextResponse.json(
        {
          error: `O subdomínio "${internalSubdomain}" já está em uso por ${emUso.organization.name}. Escolha outro.`,
        },
        { status: 400 },
      );
    }
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.organization.update({
      where: { id },
      data: {
        name,
        legalName: optional(orgBody.legalName, 160),
        segment: optional(orgBody.segment, 80),
        siteUrl: optional(orgBody.siteUrl, 300),
        ...(documento ?? {}),
      },
    });

    await transaction.organizationProfile.upsert({
      where: { organizationId: id },
      create: {
        organizationId: id,
        ownerName: optional(profile.ownerName, 160),
        responsibleCpf,
        ownerRole: optional(profile.ownerRole, 80),
        phone: optional(profile.phone, 60),
        whatsapp: optional(profile.whatsapp, 60),
        email: optional(profile.email, 160),
        bestContactTime: optional(profile.bestContactTime, 120),
        stateRegistration: optional(profile.stateRegistration, 80),
        municipalRegistration: optional(profile.municipalRegistration, 80),
        companyDescription: optional(profile.companyDescription, 2000),
        servicesOffered: optional(profile.servicesOffered, 2000),
        productsOffered: optional(profile.productsOffered, 2000),
        commercialDifferentials: optional(profile.commercialDifferentials, 1200),
        serviceArea: optional(profile.serviceArea, 1200),
        postalCode: optional(profile.postalCode, 20),
        street: optional(profile.street, 180),
        number: optional(profile.number, 40),
        complement: optional(profile.complement, 120),
        district: optional(profile.district, 120),
        city: optional(profile.city, 120),
        state: optional(profile.state, 60),
        country: optional(profile.country, 80) ?? "Brasil",
        internalOwnerName: optional(profile.internalOwnerName, 120),
        nextAction: optional(profile.nextAction, 240),
        onboardingStage: optional(profile.onboardingStage, 40) ?? "BASIC",
      },
      update: {
        ownerName: optional(profile.ownerName, 160),
        responsibleCpf,
        ownerRole: optional(profile.ownerRole, 80),
        phone: optional(profile.phone, 60),
        whatsapp: optional(profile.whatsapp, 60),
        email: optional(profile.email, 160),
        bestContactTime: optional(profile.bestContactTime, 120),
        stateRegistration: optional(profile.stateRegistration, 80),
        municipalRegistration: optional(profile.municipalRegistration, 80),
        companyDescription: optional(profile.companyDescription, 2000),
        servicesOffered: optional(profile.servicesOffered, 2000),
        productsOffered: optional(profile.productsOffered, 2000),
        commercialDifferentials: optional(profile.commercialDifferentials, 1200),
        serviceArea: optional(profile.serviceArea, 1200),
        postalCode: optional(profile.postalCode, 20),
        street: optional(profile.street, 180),
        number: optional(profile.number, 40),
        complement: optional(profile.complement, 120),
        district: optional(profile.district, 120),
        city: optional(profile.city, 120),
        state: optional(profile.state, 60),
        country: optional(profile.country, 80) ?? "Brasil",
        internalOwnerName: optional(profile.internalOwnerName, 120),
        nextAction: optional(profile.nextAction, 240),
        onboardingStage: optional(profile.onboardingStage, 40) ?? "BASIC",
      },
    });

    const contactName = optional(primaryContact.name, 160) ?? optional(profile.ownerName, 160);
    if (contactName) {
      const existingContact = await transaction.organizationContact.findFirst({
        where: { organizationId: id, type: "OWNER", isPrimary: true },
        select: { id: true },
      });
      const contactData = {
        type: "OWNER",
        name: contactName,
        role: optional(primaryContact.role, 80) ?? optional(profile.ownerRole, 80),
        phone: optional(primaryContact.phone, 60) ?? optional(profile.phone, 60),
        whatsapp: optional(primaryContact.whatsapp, 60) ?? optional(profile.whatsapp, 60),
        email: optional(primaryContact.email, 160) ?? optional(profile.email, 160),
        bestContactTime:
          optional(primaryContact.bestContactTime, 120) ?? optional(profile.bestContactTime, 120),
        notes: optional(primaryContact.notes, 600),
        isPrimary: true,
      };
      if (existingContact) {
        await transaction.organizationContact.update({
          where: { id: existingContact.id },
          data: contactData,
        });
      } else {
        await transaction.organizationContact.create({
          data: { organizationId: id, ...contactData },
        });
      }
    }

    const hasAddress = [
      primaryAddress.postalCode,
      primaryAddress.street,
      primaryAddress.city,
      primaryAddress.state,
    ].some((value) => optional(value, 180));
    if (hasAddress) {
      const existingAddress = await transaction.organizationAddress.findFirst({
        where: { organizationId: id, type: "MAIN", isPrimary: true },
        select: { id: true },
      });
      const addressData = {
        type: "MAIN",
        postalCode: optional(primaryAddress.postalCode, 20) ?? optional(profile.postalCode, 20),
        street: optional(primaryAddress.street, 180) ?? optional(profile.street, 180),
        number: optional(primaryAddress.number, 40) ?? optional(profile.number, 40),
        complement: optional(primaryAddress.complement, 120) ?? optional(profile.complement, 120),
        district: optional(primaryAddress.district, 120) ?? optional(profile.district, 120),
        city: optional(primaryAddress.city, 120) ?? optional(profile.city, 120),
        state: optional(primaryAddress.state, 60) ?? optional(profile.state, 60),
        country: optional(primaryAddress.country, 80) ?? optional(profile.country, 80) ?? "Brasil",
        source: "MANUAL",
        isPrimary: true,
      };
      if (existingAddress) {
        await transaction.organizationAddress.update({
          where: { id: existingAddress.id },
          data: addressData,
        });
      } else {
        await transaction.organizationAddress.create({
          data: { organizationId: id, ...addressData },
        });
      }
    }

    await transaction.organizationWebPresence.upsert({
      where: { organizationId: id },
      create: {
        organizationId: id,
        hasCurrentSite: booleanFromSelect(web.hasCurrentSite),
        currentSiteUrl: optional(web.currentSiteUrl, 300),
        hasDomain: booleanFromSelect(web.hasDomain),
        primaryDomain: optional(web.primaryDomain, 160),
        siteProvider: optional(web.siteProvider, 120),
        accessStatus: optional(web.accessStatus, 40),
        siteNotes: optional(web.siteNotes, 600),
        selectedDomainPlanSlug: optional(web.selectedDomainPlanSlug, 80),
        desiredDomain: optional(web.desiredDomain, 160),
        internalSubdomain,
        internalUrl,
        preferredExtension: optional(web.preferredExtension, 30),
        alternativeDomains: optional(web.alternativeDomains, 500),
        domainAvailabilityStatus: optional(web.domainAvailabilityStatus, 40) ?? "NOT_CHECKED",
        facebookPageName: optional(web.facebookPageName, 160),
        facebookUrl: optional(web.facebookUrl, 300),
        instagramHandle: optional(web.instagramHandle, 120),
        instagramUrl: optional(web.instagramUrl, 300),
        linkedinUrl: optional(web.linkedinUrl, 300),
        tiktokUrl: optional(web.tiktokUrl, 300),
        youtubeUrl: optional(web.youtubeUrl, 300),
        googleBusinessProfileUrl: optional(web.googleBusinessProfileUrl, 300),
        otherSocialProfiles: optional(web.otherSocialProfiles, 1200),
        hasPdfCatalog: optional(web.hasPdfCatalog, 40),
        socialMediaOwnerStatus: optional(web.socialMediaOwnerStatus, 60),
        hasProfessionalEmail: optional(web.hasProfessionalEmail, 60),
        hasCompleteBrandIdentity: optional(web.hasCompleteBrandIdentity, 60),
        onlineStoreInterest: web.onlineStoreInterest === true,
        onlineStoreNotes: optional(web.onlineStoreNotes, 1000),
      },
      update: {
        hasCurrentSite: booleanFromSelect(web.hasCurrentSite),
        currentSiteUrl: optional(web.currentSiteUrl, 300),
        hasDomain: booleanFromSelect(web.hasDomain),
        primaryDomain: optional(web.primaryDomain, 160),
        siteProvider: optional(web.siteProvider, 120),
        accessStatus: optional(web.accessStatus, 40),
        siteNotes: optional(web.siteNotes, 600),
        selectedDomainPlanSlug: optional(web.selectedDomainPlanSlug, 80),
        desiredDomain: optional(web.desiredDomain, 160),
        internalSubdomain,
        internalUrl,
        preferredExtension: optional(web.preferredExtension, 30),
        alternativeDomains: optional(web.alternativeDomains, 500),
        domainAvailabilityStatus: optional(web.domainAvailabilityStatus, 40) ?? "NOT_CHECKED",
        facebookPageName: optional(web.facebookPageName, 160),
        facebookUrl: optional(web.facebookUrl, 300),
        instagramHandle: optional(web.instagramHandle, 120),
        instagramUrl: optional(web.instagramUrl, 300),
        linkedinUrl: optional(web.linkedinUrl, 300),
        tiktokUrl: optional(web.tiktokUrl, 300),
        youtubeUrl: optional(web.youtubeUrl, 300),
        googleBusinessProfileUrl: optional(web.googleBusinessProfileUrl, 300),
        otherSocialProfiles: optional(web.otherSocialProfiles, 1200),
        hasPdfCatalog: optional(web.hasPdfCatalog, 40),
        socialMediaOwnerStatus: optional(web.socialMediaOwnerStatus, 60),
        hasProfessionalEmail: optional(web.hasProfessionalEmail, 60),
        hasCompleteBrandIdentity: optional(web.hasCompleteBrandIdentity, 60),
        onlineStoreInterest: web.onlineStoreInterest === true,
        onlineStoreNotes: optional(web.onlineStoreNotes, 1000),
      },
    });

    for (const [platform, social] of Object.entries(socialProfiles)) {
      const identifier = optional(social?.identifier, 180);
      const url = optional(social?.url, 300);
      if (!identifier && !url) continue;
      await transaction.organizationSocialProfile.upsert({
        where: {
          organizationId_platform: {
            organizationId: id,
            platform,
          },
        },
        create: {
          organizationId: id,
          platform,
          identifier,
          url,
          status: "ACTIVE",
        },
        update: {
          identifier,
          url,
          status: "ACTIVE",
        },
      });
    }

    for (const rawStep of onboardingSteps.slice(0, 20)) {
      const stepKey = optional(rawStep.stepKey, 80);
      const label = optional(rawStep.label, 160);
      if (!stepKey || !label) continue;
      const status = optional(rawStep.status, 40) ?? "PENDING";
      await transaction.organizationOnboardingStep.upsert({
        where: {
          organizationId_stepKey: {
            organizationId: id,
            stepKey,
          },
        },
        create: {
          organizationId: id,
          stepKey,
          label,
          status,
          notes: optional(rawStep.notes, 500),
          sortOrder: Number(rawStep.sortOrder) || 0,
          completedAt: status === "DONE" ? new Date() : null,
        },
        update: {
          label,
          status,
          notes: optional(rawStep.notes, 500),
          sortOrder: Number(rawStep.sortOrder) || 0,
          completedAt: status === "DONE" ? new Date() : null,
        },
      });
    }

    if (seoKeywords) {
      await transaction.organizationSeoKeyword.deleteMany({ where: { organizationId: id } });
    }
    if (seoKeywords && seoKeywords.length > 0) {
      await transaction.organizationSeoKeyword.createMany({
        data: seoKeywords.map((item) => ({ organizationId: id, ...item })),
      });
    }

    if (brandAssets) {
      await transaction.organizationBrandAsset.deleteMany({ where: { organizationId: id } });
    }
    if (brandAssets && brandAssets.length > 0) {
      await transaction.organizationBrandAsset.createMany({
        data: brandAssets.map((item) => ({ organizationId: id, ...item })),
      });
    }

    for (const row of integrations) {
      await transaction.organizationIntegration.upsert({
        where: {
          organizationId_provider: {
            organizationId: id,
            provider: row.provider,
          },
        },
        create: row,
        update: { publicId: row.publicId, status: row.status },
      });
    }

    const opportunityInputs = [
      ["DOMAIN", optional(opportunities.domain, 80)],
      ["PDF_CATALOG", optional(opportunities.catalog, 80)],
      ["SOCIAL_MEDIA", optional(opportunities.social, 80)],
      ["PROFESSIONAL_EMAIL", optional(opportunities.email, 80)],
      ["BRAND_IDENTITY", optional(opportunities.brand, 80)],
      ["ONLINE_STORE", optional(opportunities.onlineStore, 80)],
    ] as const;

    for (const [serviceType, value] of opportunityInputs) {
      if (!value) continue;
      const plan = await transaction.servicePlan.findUnique({
        where: { id: value },
        select: { id: true },
      });
      await transaction.organizationServiceOpportunity.upsert({
        where: {
          organizationId_serviceType: {
            organizationId: id,
            serviceType,
          },
        },
        create: {
          organizationId: id,
          serviceType,
          planId: plan?.id,
          commercialStatus: serviceType === "ONLINE_STORE" ? "WAITLIST" : "OFFER_RECOMMENDED",
          interestStatus: value,
        },
        update: {
          planId: plan?.id,
          commercialStatus: serviceType === "ONLINE_STORE" ? "WAITLIST" : "OFFER_RECOMMENDED",
          interestStatus: value,
        },
      });
    }

    await transaction.operationsAuditEvent.create({
      data: {
        actorId: admin.id,
        organizationId: id,
        action: "ORGANIZATION_DOSSIER_UPDATED",
        entityType: "Organization",
        entityId: id,
        metadata: {
          seoKeywordCount: seoKeywords?.length ?? null,
          brandAssetCount: brandAssets?.length ?? null,
          integrationCount: integrations.length,
          onboardingStepCount: onboardingSteps.length,
          cpfCnpjAlterado: documento !== null,
          consultaReceita: documento?.cpfCnpj?.length === 14 ? !aviso : null,
        },
      },
    });
  });

  return NextResponse.json({ ok: true, aviso });
}
