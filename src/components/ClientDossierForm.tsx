"use client";

import { FormEvent, MouseEvent, ReactNode, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Sheet from "@/components/ui/Sheet";
import { Icone } from "@/components/ui/Icones";
import GeradorDeIcones from "@/components/GeradorDeIcones";

type Plan = {
  id: string;
  serviceType: string;
  slug: string;
  name: string;
  description: string | null;
  priceCents: number | null;
  billingCycle: string | null;
};

/**
 * Bloco temático dentro de uma seção. A "Presença digital" tinha 21 campos
 * seguidos numa grade só: no celular vira uma coluna de 21 caixas iguais, sem
 * nada dizendo onde termina o site e começam as redes. O grupo dá o título que
 * a pessoa usa para se localizar, e no desktop continua sendo a mesma grade.
 */
function Grupo({
  titulo,
  colunas = "three",
  children,
}: {
  titulo: string;
  colunas?: "two" | "three";
  children: ReactNode;
}) {
  return (
    <div className="grupo-campos">
      <h3>{titulo}</h3>
      <div className={`dossier-grid ${colunas}`}>{children}</div>
    </div>
  );
}

type Keyword = {
  id: string;
  keyword: string;
  intent: string | null;
  locality: string | null;
  priority: string;
  estimatedVolume: string | null;
  recommendedPage: string | null;
  status: string;
};

type Asset = {
  id: string;
  assetType: string;
  name: string | null;
  url: string | null;
  format: string | null;
  mimeType?: string | null;
  dimensions: string | null;
  version: string | null;
  isCurrent?: boolean;
  notes: string | null;
  sizeBytes?: number | null;
};

type Contact = {
  id: string;
  type: string;
  name: string;
  role: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  bestContactTime: string | null;
  isPrimary: boolean;
  notes: string | null;
};

type Address = {
  id: string;
  type: string;
  postalCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  isPrimary: boolean;
};

type SocialProfile = {
  id: string;
  platform: string;
  identifier: string | null;
  url: string | null;
  status: string;
};

type OnboardingStep = {
  id: string;
  stepKey: string;
  label: string;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
  notes: string | null;
  sortOrder: number;
};

type Opportunity = {
  id: string;
  serviceType: string;
  currentSituation: string | null;
  interestStatus: string | null;
  commercialStatus: string;
  notes: string | null;
  nextAction: string | null;
  planId: string | null;
};

type Integration = {
  id: string;
  provider: string;
  publicId: string | null;
  accountName: string | null;
  url: string | null;
  status: string;
};

type OrganizationData = {
  id: string;
  name: string;
  legalName: string | null;
  cpfCnpj: string | null;
  segment: string | null;
  siteUrl: string | null;
  status: string;
  profile: Record<string, string | null> | null;
  contacts: Contact[];
  addresses: Address[];
  socialProfiles: SocialProfile[];
  webPresence: Record<string, string | boolean | null> | null;
  seoKeywords: Keyword[];
  brandAssets: Asset[];
  files: Asset[];
  onboardingSteps: OnboardingStep[];
  organizationIntegrations: Integration[];
  serviceOpportunities: Opportunity[];
};

const tabs = [
  ["overview", "Visão geral"],
  ["registration", "Dados cadastrais"],
  ["presence", "Presença digital"],
  ["seo", "SEO e conteúdo"],
  ["assets", "Identidade e arquivos"],
  ["integrations", "Analytics e integrações"],
  ["opportunities", "Serviços e oportunidades"],
] as const;

const assetTypes = [
  "Logo principal",
  "Logo horizontal",
  "Logo vertical",
  "Símbolo",
  "Versão clara",
  "Versão escura",
  "Favicon",
  "Ícone 192x192",
  "Ícone 512x512",
  "Apple Touch Icon",
  "Preview image",
  "Open Graph Image",
  "Banner desktop",
  "Banner mobile",
  "Manual da marca",
  "Paleta de cores",
  "Fontes",
  "Outros arquivos",
];

function valueOf(value: unknown) {
  return typeof value === "string" ? value : "";
}

function boolValue(value: unknown) {
  if (value === true) return "YES";
  if (value === false) return "NO";
  return "";
}

const PRIORIDADES: Record<string, string> = {
  HIGH: "Alta",
  MEDIUM: "Média",
  LOW: "Baixa",
};

const STATUS_KEYWORD: Record<string, string> = {
  RECOMMENDED: "Recomendada",
  PLANNED: "Planejada",
  IN_PRODUCTION: "Em produção",
  PUBLISHED: "Publicada",
  PAUSED: "Pausada",
};

function rotuloPrioridade(valor: string) {
  return PRIORIDADES[valor] ?? valor;
}

function rotuloStatus(valor: string) {
  return STATUS_KEYWORD[valor] ?? valor;
}

function cents(plan: Plan) {
  if (plan.priceCents === null) return "A definir";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(plan.priceCents / 100);
}

function groupedPlans(plans: Plan[]) {
  return plans.reduce<Record<string, Plan[]>>((groups, plan) => {
    groups[plan.serviceType] = groups[plan.serviceType] ?? [];
    groups[plan.serviceType].push(plan);
    return groups;
  }, {});
}

export default function ClientDossierForm({
  organization,
  plans,
  initialTab = "overview",
}: {
  organization: OrganizationData;
  plans: Plan[];
  initialTab?: (typeof tabs)[number][0];
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number][0]>(initialTab);
  const [secoesAbertas, setSecoesAbertas] = useState(false);
  // A barra de "salvar" só existe quando há o que salvar: barra fixa
  // permanente rouba altura útil de uma tela que já é pequena.
  const [temAlteracao, setTemAlteracao] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingKeyword, setSavingKeyword] = useState("");
  // "" = folha fechada, "new" = cadastrando, id = editando aquela palavra.
  const [editandoKeyword, setEditandoKeyword] = useState("");
  const [uploadingAsset, setUploadingAsset] = useState("");
  const [loadingCep, setLoadingCep] = useState(false);
  const [checkingDomain, setCheckingDomain] = useState(false);
  const [publishingInternalSite, setPublishingInternalSite] = useState(false);
  const [domainCheck, setDomainCheck] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const planGroups = useMemo(() => groupedPlans(plans), [plans]);
  const keywordEmEdicao = organization.seoKeywords.find((item) => item.id === editandoKeyword);
  const primaryContact = organization.contacts.find((item) => item.isPrimary) ?? organization.contacts[0];
  const primaryAddress = organization.addresses.find((item) => item.isPrimary) ?? organization.addresses[0];
  const socialByPlatform = useMemo(
    () =>
      organization.socialProfiles.reduce<Record<string, SocialProfile>>((items, item) => {
        items[item.platform] = item;
        return items;
      }, {}),
    [organization.socialProfiles],
  );
  const integrationByProvider = useMemo(
    () =>
      organization.organizationIntegrations.reduce<Record<string, Integration>>((items, item) => {
        items[item.provider] = item;
        return items;
      }, {}),
    [organization.organizationIntegrations],
  );
  const onboardingFallback = [
    ["BASIC", "Cadastro básico", Boolean(organization.name && organization.legalName)],
    ["COMPLETE_DATA", "Dados completos", Boolean(primaryContact?.name || organization.profile?.ownerName)],
    ["IDENTITY", "Identidade", organization.brandAssets.length > 0],
    ["SITE", "Site", Boolean(organization.webPresence?.currentSiteUrl || organization.siteUrl)],
    ["INTEGRATIONS", "Integrações", Boolean(organization.webPresence?.googleBusinessProfileUrl)],
    ["PUBLISHED", "Publicação", valueOf(organization.profile?.onboardingStage) === "PUBLISHED"],
  ] as const;
  const onboardingItems =
    organization.onboardingSteps.length > 0
      ? organization.onboardingSteps
      : onboardingFallback.map(([stepKey, label, done], index) => ({
          id: stepKey,
          stepKey,
          label,
          status: done ? "DONE" : "PENDING",
          dueDate: null,
          completedAt: null,
          notes: null,
          sortOrder: index,
        }));
  const completed = [
    organization.name,
    organization.profile?.ownerName,
    organization.profile?.whatsapp,
    organization.webPresence?.hasCurrentSite !== null,
    organization.seoKeywords.length > 0,
    organization.brandAssets.length > 0,
    organization.webPresence?.googleBusinessProfileUrl,
  ].filter(Boolean).length;
  const progress = Math.round((completed / 7) * 100);
  const indiceTabAtual = tabs.findIndex(([id]) => id === activeTab);
  const tabAtual = tabs[indiceTabAtual];
  const onboardingProgress = Math.round(
    (onboardingItems.filter((item) => item.status === "DONE").length / onboardingItems.length) * 100,
  );

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    const form = new FormData(event.currentTarget);
    const payload = {
      organization: {
        name: form.get("name"),
        legalName: form.get("legalName"),
        segment: form.get("segment"),
        siteUrl: form.get("siteUrl"),
      },
      profile: {
        ownerName: form.get("ownerName"),
        ownerRole: form.get("ownerRole"),
        phone: form.get("phone"),
        whatsapp: form.get("whatsapp"),
        email: form.get("email"),
        bestContactTime: form.get("bestContactTime"),
        stateRegistration: form.get("stateRegistration"),
        municipalRegistration: form.get("municipalRegistration"),
        companyDescription: form.get("companyDescription"),
        servicesOffered: form.get("servicesOffered"),
        productsOffered: form.get("productsOffered"),
        commercialDifferentials: form.get("commercialDifferentials"),
        serviceArea: form.get("serviceArea"),
        postalCode: form.get("postalCode"),
        street: form.get("street"),
        number: form.get("number"),
        complement: form.get("complement"),
        district: form.get("district"),
        city: form.get("city"),
        state: form.get("state"),
        country: form.get("country"),
        internalOwnerName: form.get("internalOwnerName"),
        nextAction: form.get("nextAction"),
        onboardingStage: form.get("onboardingStage"),
      },
      primaryContact: {
        name: form.get("ownerName"),
        role: form.get("ownerRole"),
        phone: form.get("phone"),
        whatsapp: form.get("whatsapp"),
        email: form.get("email"),
        bestContactTime: form.get("bestContactTime"),
        notes: form.get("contactNotes"),
      },
      primaryAddress: {
        postalCode: form.get("postalCode"),
        street: form.get("street"),
        number: form.get("number"),
        complement: form.get("complement"),
        district: form.get("district"),
        city: form.get("city"),
        state: form.get("state"),
        country: form.get("country"),
      },
      webPresence: {
        hasCurrentSite: form.get("hasCurrentSite"),
        currentSiteUrl: form.get("currentSiteUrl"),
        hasDomain: form.get("hasDomain"),
        primaryDomain: form.get("primaryDomain"),
        siteProvider: form.get("siteProvider"),
        accessStatus: form.get("accessStatus"),
        siteNotes: form.get("siteNotes"),
        selectedDomainPlanSlug: form.get("selectedDomainPlanSlug"),
        desiredDomain: form.get("desiredDomain"),
        internalSubdomain: form.get("internalSubdomain"),
        preferredExtension: form.get("preferredExtension"),
        alternativeDomains: form.get("alternativeDomains"),
        domainAvailabilityStatus: form.get("domainAvailabilityStatus"),
        facebookPageName: form.get("facebookPageName"),
        facebookUrl: form.get("facebookUrl"),
        instagramHandle: form.get("instagramHandle"),
        instagramUrl: form.get("instagramUrl"),
        linkedinUrl: form.get("linkedinUrl"),
        tiktokUrl: form.get("tiktokUrl"),
        youtubeUrl: form.get("youtubeUrl"),
        googleBusinessProfileUrl: form.get("googleBusinessProfileUrl"),
        otherSocialProfiles: form.get("otherSocialProfiles"),
        hasPdfCatalog: form.get("hasPdfCatalog"),
        socialMediaOwnerStatus: form.get("socialMediaOwnerStatus"),
        hasProfessionalEmail: form.get("hasProfessionalEmail"),
        hasCompleteBrandIdentity: form.get("hasCompleteBrandIdentity"),
        onlineStoreInterest: form.get("onlineStoreInterest") === "on",
        onlineStoreNotes: form.get("onlineStoreNotes"),
      },
      socialProfiles: {
        facebook: {
          identifier: form.get("facebookPageName"),
          url: form.get("facebookUrl"),
        },
        instagram: {
          identifier: form.get("instagramHandle"),
          url: form.get("instagramUrl"),
        },
        linkedin: { url: form.get("linkedinUrl") },
        tiktok: { url: form.get("tiktokUrl") },
        youtube: { url: form.get("youtubeUrl") },
        google_business_profile: { url: form.get("googleBusinessProfileUrl") },
      },
      onboardingSteps: onboardingItems.map((item) => ({
        stepKey: item.stepKey,
        label: item.label,
        status: form.get(`onboarding:${item.stepKey}:status`) ?? item.status,
        notes: form.get(`onboarding:${item.stepKey}:notes`) ?? item.notes,
        sortOrder: item.sortOrder,
      })),
      brandAssetsText: form.get("brandAssetsText"),
      integrations: {
        ga4: form.get("ga4"),
        gtm: form.get("gtm"),
        searchConsole: form.get("searchConsole"),
        metaPixel: form.get("metaPixel"),
        metaBusiness: form.get("metaBusiness"),
        googleAds: form.get("googleAds"),
        whatsappBusiness: form.get("whatsappBusiness"),
        transactionalEmail: form.get("transactionalEmail"),
      },
      opportunities: {
        domain: form.get("domainOpportunityPlan"),
        catalog: form.get("catalogOpportunityPlan"),
        social: form.get("socialOpportunityPlan"),
        email: form.get("emailOpportunityStatus"),
        brand: form.get("brandOpportunityPlan"),
        onlineStore: form.get("onlineStoreOpportunityStatus"),
      },
    };

    try {
      const response = await fetch(`/api/organizations/${organization.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar.");
      setMessage("Ficha salva com sucesso.");
      // Salvou: a barra de "alterações não salvas" some, senão ela mente.
      setTemAlteracao(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function checkDomain(event: MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form;
    const desiredDomainInput = form?.elements.namedItem("desiredDomain") as HTMLInputElement | null;
    const statusSelect = form?.elements.namedItem("domainAvailabilityStatus") as HTMLSelectElement | null;
    const domain = desiredDomainInput?.value ?? "";
    if (!domain.trim()) {
      setError("Informe o domínio desejado antes de verificar.");
      return;
    }

    setCheckingDomain(true);
    setDomainCheck("");
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/domains/availability", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const result = (await response.json()) as {
        domain?: string;
        status?: string;
        message?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível verificar o domínio.");
      if (statusSelect && result.status) statusSelect.value = result.status;
      if (desiredDomainInput && result.domain) desiredDomainInput.value = result.domain;
      setDomainCheck(`${result.domain}: ${result.status} · ${result.message}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível verificar o domínio.");
    } finally {
      setCheckingDomain(false);
    }
  }

  async function updateInternalSite(action: "publish" | "unpublish") {
    setPublishingInternalSite(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/organizations/${organization.id}/internal-site`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = (await response.json()) as { error?: string; internalUrl?: string; status?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível atualizar a publicação.");
      setMessage(
        action === "publish"
          ? `Site interno publicado: ${result.internalUrl}`
          : "Site interno voltou para rascunho.",
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível atualizar a publicação.");
    } finally {
      setPublishingInternalSite(false);
    }
  }

  async function fillAddressFromCep(event: MouseEvent<HTMLButtonElement>) {
    const postalCodeInput = event.currentTarget
      .closest(".dossier-grid")
      ?.querySelector<HTMLInputElement>('input[name="postalCode"]');
    const postalCode = postalCodeInput?.value.replace(/\D/g, "");
    if (!postalCode || postalCode.length !== 8) {
      setError("Informe um CEP com 8 dígitos.");
      return;
    }

    setLoadingCep(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`https://viacep.com.br/ws/${postalCode}/json/`);
      const data = (await response.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (!response.ok || data.erro) throw new Error("CEP não encontrado.");
      const form = event.currentTarget.form;
      if (!form) return;
      const set = (name: string, value = "") => {
        const input = form.elements.namedItem(name) as HTMLInputElement | null;
        if (input && !input.value) input.value = value;
      };
      set("street", data.logradouro);
      set("district", data.bairro);
      set("city", data.localidade);
      set("state", data.uf);
      setMessage("Endereço preenchido pelo CEP.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível consultar o CEP.");
    } finally {
      setLoadingCep(false);
    }
  }

  async function uploadAsset(event: MouseEvent<HTMLButtonElement>, assetType: string) {
    const card = event.currentTarget.closest<HTMLElement>("[data-asset-card]");
    if (!card) return;
    const fileInput = card.querySelector<HTMLInputElement>('input[type="file"]');
    const dimensionsInput = card.querySelector<HTMLInputElement>('input[name="dimensions"]');
    const notesInput = card.querySelector<HTMLTextAreaElement>('textarea[name="notes"]');
    const file = fileInput?.files?.[0];

    const data = new FormData();
    data.set("assetType", assetType);
    if (file) data.set("file", file);
    if (dimensionsInput?.value) data.set("dimensions", dimensionsInput.value);
    if (notesInput?.value) data.set("notes", notesInput.value);

    setUploadingAsset(assetType);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`/api/organizations/${organization.id}/brand-assets`, {
        method: "POST",
        body: data,
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível enviar o arquivo.");
      if (fileInput) fileInput.value = "";
      if (dimensionsInput) dimensionsInput.value = "";
      if (notesInput) notesInput.value = "";
      setMessage("Arquivo enviado e versionado.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível enviar o arquivo.");
    } finally {
      setUploadingAsset("");
    }
  }

  async function saveKeyword(event: MouseEvent<HTMLButtonElement>, keywordId?: string) {
    const container = event.currentTarget.closest<HTMLElement>("[data-seo-keyword]");
    if (!container) return;
    const field = (name: string) =>
      container.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? "";
    setSavingKeyword(keywordId ?? "new");
    setMessage("");
    setError("");

    const payload = {
      keyword: field("keyword"),
      intent: field("intent"),
      locality: field("locality"),
      priority: field("priority"),
      estimatedVolume: field("estimatedVolume"),
      recommendedPage: field("recommendedPage"),
      status: field("status"),
    };

    try {
      const endpoint = keywordId
        ? `/api/organizations/${organization.id}/seo-keywords/${keywordId}`
        : `/api/organizations/${organization.id}/seo-keywords`;
      const response = await fetch(endpoint, {
        method: keywordId ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "Não foi possível salvar a palavra-chave.");
      }
      if (!keywordId) {
        container.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
          input.value = "";
        });
      }
      setMessage(keywordId ? "Palavra-chave atualizada." : "Palavra-chave adicionada.");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível salvar a palavra-chave.",
      );
    } finally {
      setSavingKeyword("");
    }
  }

  async function deleteKeyword(keywordId: string) {
    setSavingKeyword(keywordId);
    setMessage("");
    setError("");

    try {
      const response = await fetch(
        `/api/organizations/${organization.id}/seo-keywords/${keywordId}`,
        { method: "DELETE" },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "Não foi possível remover a palavra-chave.");
      }
      setMessage("Palavra-chave removida.");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível remover a palavra-chave.",
      );
    } finally {
      setSavingKeyword("");
    }
  }

  return (
    <form
      className={temAlteracao ? "client-dossier tem-alteracao" : "client-dossier"}
      onSubmit={save}
      onChange={() => {
        if (!temAlteracao) setTemAlteracao(true);
      }}
    >
      {/* Só o quanto falta. O nome e a razão social já são o título da página e
          os dois primeiros campos da aba; a régua das seis etapas se repetia em
          toda ficha sem dizer em qual delas o cliente está. */}
      <section className="operations-panel dossier-hero-panel">
        <div className="dossier-progress">
          <span>{onboardingProgress || progress}% preenchido</span>
          <div><i style={{ width: `${onboardingProgress || progress}%` }} /></div>
        </div>
      </section>

      {/* No celular, sete abas lado a lado ficavam cortadas nas duas bordas e
          não davam para ler nem alcançar. No lugar delas, a seção atual com um
          seletor: a pessoa sempre sabe onde está e quantas seções existem. O
          desktop segue com as abas, que ali cabem. */}
      <button
        className="seletor-secao"
        type="button"
        onClick={() => setSecoesAbertas(true)}
        aria-haspopup="dialog"
      >
        <span>
          <strong>{tabAtual?.[1]}</strong>
          <small>
            {indiceTabAtual + 1} de {tabs.length} · trocar seção
          </small>
        </span>
        <Icone nome="chevron" tamanho={18} className="chevron" />
      </button>

      {secoesAbertas ? (
        <Sheet titulo="Seções da ficha" aoFechar={() => setSecoesAbertas(false)}>
          <div className="lista-secoes">
            {tabs.map(([id, label], indice) => (
              <button
                aria-current={activeTab === id}
                key={id}
                type="button"
                onClick={() => {
                  setActiveTab(id);
                  setSecoesAbertas(false);
                }}
              >
                <span>{label}</span>
                <small>{indice + 1}</small>
              </button>
            ))}
          </div>
        </Sheet>
      ) : null}

      <nav className="dossier-tabs" aria-label="Abas da ficha do cliente">
        {tabs.map(([id, label]) => (
          <button
            className={activeTab === id ? "active" : ""}
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <section className={activeTab === "overview" ? "dossier-tab active" : "dossier-tab"}>
        <div className="dossier-grid three">
          <label>Nome fantasia<input name="name" defaultValue={organization.name} /></label>
          <label>Razão social<input name="legalName" defaultValue={organization.legalName ?? ""} /></label>
          <label>CPF/CNPJ<input disabled defaultValue={organization.cpfCnpj ?? ""} /></label>
          <label>Segmento<input name="segment" defaultValue={organization.segment ?? ""} /></label>
          <label>Proprietário<input disabled defaultValue={primaryContact?.name ?? valueOf(organization.profile?.ownerName)} /></label>
          <label>Telefone<input disabled defaultValue={primaryContact?.phone ?? valueOf(organization.profile?.phone)} /></label>
          <label>WhatsApp<input disabled defaultValue={primaryContact?.whatsapp ?? valueOf(organization.profile?.whatsapp)} /></label>
          <label>Site<input name="siteUrl" defaultValue={organization.siteUrl ?? ""} /></label>
          <label>Domínio<input disabled defaultValue={valueOf(organization.webPresence?.primaryDomain)} /></label>
          <label>Status do onboarding<select name="onboardingStage" defaultValue={valueOf(organization.profile?.onboardingStage) || "BASIC"}><option value="BASIC">Cadastro básico</option><option value="COMPLETE_DATA">Dados completos</option><option value="IDENTITY">Identidade</option><option value="SITE">Site</option><option value="INTEGRATIONS">Integrações</option><option value="PUBLISHED">Publicação</option></select></label>
          <label>Responsável interno<input name="internalOwnerName" defaultValue={valueOf(organization.profile?.internalOwnerName)} /></label>
          <label>Próxima ação<input name="nextAction" defaultValue={valueOf(organization.profile?.nextAction)} /></label>
        </div>
        <div className="overview-summary-grid">
          <article>
            <span className="eyebrow">Serviços ativos</span>
            <strong>
              {organization.serviceOpportunities.filter((item) =>
                ["CONTRACTED", "IMPLEMENTING", "ACTIVE"].includes(item.commercialStatus),
              ).length}
            </strong>
            <p>Oportunidades marcadas como contratadas, em implantação ou ativas.</p>
          </article>
          <article>
            <span className="eyebrow">Serviços oferecidos</span>
            <strong>
              {organization.serviceOpportunities.filter((item) =>
                ["OFFER_RECOMMENDED", "PRESENTED", "INTERESTED", "WAITLIST"].includes(item.commercialStatus),
              ).length}
            </strong>
            <p>Planos recomendados, apresentados, interessados ou em lista de espera.</p>
          </article>
          <article>
            <span className="eyebrow">Pendências</span>
            <strong>{onboardingItems.filter((item) => item.status !== "DONE").length}</strong>
            <p>Etapas de onboarding que ainda precisam de evidência ou conclusão.</p>
          </article>
        </div>
        <div className="internal-site-card">
          <div>
            <span className="eyebrow">Publicação interna</span>
            <strong>{valueOf(organization.webPresence?.internalSiteStatus) || "DRAFT"}</strong>
            <p>
              {valueOf(organization.webPresence?.internalUrl) ||
                "O endereço interno será criado automaticamente ao publicar."}
            </p>
          </div>
          <div className="internal-site-actions">
            {valueOf(organization.webPresence?.internalUrl) ? (
              <a
                className="secondary-button"
                href={valueOf(organization.webPresence?.internalUrl)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir
              </a>
            ) : null}
            <button
              className="primary-button"
              type="button"
              onClick={() => updateInternalSite("publish")}
              disabled={publishingInternalSite}
            >
              {publishingInternalSite ? "Publicando..." : "Publicar"}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => updateInternalSite("unpublish")}
              disabled={publishingInternalSite}
            >
              Rascunho
            </button>
          </div>
        </div>
        <div className="onboarding-checklist">
          {onboardingItems.map((item) => (
            <div className="onboarding-step-row" key={item.stepKey}>
              <strong>{item.label}</strong>
              <select name={`onboarding:${item.stepKey}:status`} defaultValue={item.status}>
                <option value="PENDING">Pendente</option>
                <option value="IN_PROGRESS">Em andamento</option>
                <option value="BLOCKED">Bloqueada</option>
                <option value="DONE">Concluída</option>
              </select>
              <input
                name={`onboarding:${item.stepKey}:notes`}
                defaultValue={item.notes ?? ""}
                placeholder="Evidência, pendência ou próxima ação"
              />
            </div>
          ))}
        </div>
      </section>

      <section className={activeTab === "registration" ? "dossier-tab active" : "dossier-tab"}>
        <div className="dossier-grid two">
          <label>Inscrição estadual<input name="stateRegistration" defaultValue={valueOf(organization.profile?.stateRegistration)} /></label>
          <label>Inscrição municipal<input name="municipalRegistration" defaultValue={valueOf(organization.profile?.municipalRegistration)} /></label>
          <label>Nome do proprietário<input name="ownerName" defaultValue={primaryContact?.name ?? valueOf(organization.profile?.ownerName)} /></label>
          <label>Cargo<input name="ownerRole" defaultValue={primaryContact?.role ?? valueOf(organization.profile?.ownerRole)} /></label>
          <label>Telefone fixo<input name="phone" defaultValue={primaryContact?.phone ?? valueOf(organization.profile?.phone)} /></label>
          <label>WhatsApp<input name="whatsapp" defaultValue={primaryContact?.whatsapp ?? valueOf(organization.profile?.whatsapp)} /></label>
          <label>E-mail<input name="email" type="email" defaultValue={primaryContact?.email ?? valueOf(organization.profile?.email)} /></label>
          <label>Melhor horário<input name="bestContactTime" defaultValue={primaryContact?.bestContactTime ?? valueOf(organization.profile?.bestContactTime)} /></label>
          <label className="span-2">Observações do contato<textarea name="contactNotes" rows={2} defaultValue={primaryContact?.notes ?? ""} /></label>
          <label className="span-2">Descrição da empresa<textarea name="companyDescription" rows={3} defaultValue={valueOf(organization.profile?.companyDescription)} /></label>
          <label>Serviços oferecidos<textarea name="servicesOffered" rows={4} defaultValue={valueOf(organization.profile?.servicesOffered)} /></label>
          <label>Produtos oferecidos<textarea name="productsOffered" rows={4} defaultValue={valueOf(organization.profile?.productsOffered)} /></label>
          <label>Diferenciais comerciais<textarea name="commercialDifferentials" rows={3} defaultValue={valueOf(organization.profile?.commercialDifferentials)} /></label>
          <label>Área de atendimento<textarea name="serviceArea" rows={3} defaultValue={valueOf(organization.profile?.serviceArea)} /></label>
          <label className="campo-curto">CEP<input name="postalCode" defaultValue={primaryAddress?.postalCode ?? valueOf(organization.profile?.postalCode)} /></label>
          <button className="secondary-button cep-button campo-curto" type="button" onClick={fillAddressFromCep} disabled={loadingCep}>
            {loadingCep ? "Consultando..." : "Preencher pelo CEP"}
          </button>
          <label>Logradouro<input name="street" defaultValue={primaryAddress?.street ?? valueOf(organization.profile?.street)} /></label>
          <label className="campo-curto">Número<input name="number" defaultValue={primaryAddress?.number ?? valueOf(organization.profile?.number)} /></label>
          <label className="campo-curto">Complemento<input name="complement" defaultValue={primaryAddress?.complement ?? valueOf(organization.profile?.complement)} /></label>
          <label className="campo-curto">Bairro<input name="district" defaultValue={primaryAddress?.district ?? valueOf(organization.profile?.district)} /></label>
          <label className="campo-curto">Cidade<input name="city" defaultValue={primaryAddress?.city ?? valueOf(organization.profile?.city)} /></label>
          <label className="campo-curto">Estado<input name="state" defaultValue={primaryAddress?.state ?? valueOf(organization.profile?.state)} /></label>
          <label className="campo-curto">País<input name="country" defaultValue={(primaryAddress?.country ?? valueOf(organization.profile?.country)) || "Brasil"} /></label>
        </div>
      </section>

      <section className={activeTab === "presence" ? "dossier-tab active" : "dossier-tab"}>
        <Grupo titulo="Site atual">
          <label>Possui site?<select name="hasCurrentSite" defaultValue={boolValue(organization.webPresence?.hasCurrentSite)}><option value="">Não avaliado</option><option value="YES">Sim</option><option value="NO">Não</option></select></label>
          <label>URL atual<input name="currentSiteUrl" defaultValue={valueOf(organization.webPresence?.currentSiteUrl)} /></label>
          <label>Provedor atual<input name="currentProvider" defaultValue={valueOf(organization.webPresence?.currentProvider)} /></label>
          <label>Acesso disponível<input name="accessStatus" defaultValue={valueOf(organization.webPresence?.accessStatus)} /></label>
        </Grupo>

        <Grupo titulo="Domínio">
          <label>Possui domínio?<select name="hasDomain" defaultValue={boolValue(organization.webPresence?.hasDomain)}><option value="">Não avaliado</option><option value="YES">Sim</option><option value="NO">Não</option></select></label>
          <label>Domínio desejado<input name="desiredDomain" defaultValue={valueOf(organization.webPresence?.desiredDomain)} /></label>
          <label>Extensão preferida<input name="preferredExtension" defaultValue={valueOf(organization.webPresence?.preferredExtension)} /></label>
          <label>Status disponibilidade<select name="domainAvailabilityStatus" defaultValue={valueOf(organization.webPresence?.domainAvailabilityStatus) || "NOT_CHECKED"}><option value="NOT_CHECKED">Não verificado</option><option value="AVAILABLE">Disponível</option><option value="UNAVAILABLE">Indisponível</option></select></label>
          <label>Plano de domínio<select name="selectedDomainPlanSlug" defaultValue={valueOf(organization.webPresence?.selectedDomainPlanSlug)}><option value="">Nenhum</option>{(planGroups.DOMAIN ?? []).map((plan) => <option key={plan.slug} value={plan.slug}>{plan.name} · {cents(plan)}</option>)}</select></label>
          <button className="secondary-button cep-button" type="button" onClick={checkDomain} disabled={checkingDomain}>
            {checkingDomain ? "Verificando..." : "Verificar domínio"}
          </button>
          <label>Subdomínio interno<input name="internalSubdomain" defaultValue={valueOf(organization.webPresence?.internalSubdomain)} placeholder="engreaco" /></label>
          <label>Endereço interno<input readOnly value={valueOf(organization.webPresence?.internalUrl)} placeholder="Gerado a partir do subdomínio ao salvar" /></label>
        </Grupo>

        <Grupo titulo="Redes sociais">
          <label>Facebook página<input name="facebookPageName" defaultValue={socialByPlatform.facebook?.identifier ?? valueOf(organization.webPresence?.facebookPageName)} /></label>
          <label>Facebook URL<input name="facebookUrl" defaultValue={socialByPlatform.facebook?.url ?? valueOf(organization.webPresence?.facebookUrl)} /></label>
          <label>Instagram usuário<input name="instagramHandle" defaultValue={socialByPlatform.instagram?.identifier ?? valueOf(organization.webPresence?.instagramHandle)} /></label>
          <label>Instagram URL<input name="instagramUrl" defaultValue={socialByPlatform.instagram?.url ?? valueOf(organization.webPresence?.instagramUrl)} /></label>
          <label>LinkedIn<input name="linkedinUrl" defaultValue={socialByPlatform.linkedin?.url ?? valueOf(organization.webPresence?.linkedinUrl)} /></label>
          <label>TikTok<input name="tiktokUrl" defaultValue={socialByPlatform.tiktok?.url ?? valueOf(organization.webPresence?.tiktokUrl)} /></label>
          <label>YouTube<input name="youtubeUrl" defaultValue={socialByPlatform.youtube?.url ?? valueOf(organization.webPresence?.youtubeUrl)} /></label>
          <label>Perfil Google<input name="googleBusinessProfileUrl" defaultValue={socialByPlatform.google_business_profile?.url ?? valueOf(organization.webPresence?.googleBusinessProfileUrl)} /></label>
          <label className="span-3">Outras redes<textarea name="otherSocialProfiles" rows={3} defaultValue={valueOf(organization.webPresence?.otherSocialProfiles)} /></label>
        </Grupo>
        {domainCheck ? <p className="inline-feedback feedback-success">{domainCheck}</p> : null}
      </section>

      <section className={activeTab === "seo" ? "dossier-tab active" : "dossier-tab"}>
        <div className="seo-keyword-panel">
          <div className="seo-keyword-heading">
            <div>
              <h3>Palavras-chave recomendadas</h3>
            </div>
            <small>{organization.seoKeywords.length} itens cadastrados</small>
          </div>

          {/* Lista primeiro, editor sob demanda. Sete campos por linha viravam
              sete caixas empilhadas por palavra-chave: com dez palavras a tela
              tinha setenta campos e nenhuma visão do conjunto. Agora a linha
              mostra o que identifica o termo, e editar abre a folha. */}
          <button className="secondary-button botao-adicionar" type="button" onClick={() => setEditandoKeyword("new")}>
            Adicionar palavra-chave
          </button>

          {organization.seoKeywords.length === 0 ? (
            <div className="operations-empty compact-empty">
              <strong>Nenhuma palavra-chave cadastrada.</strong>
              <p>Cadastre termos de busca com intenção, localidade, prioridade e página recomendada.</p>
            </div>
          ) : (
            <ul className="lista-keywords">
              {organization.seoKeywords.map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => setEditandoKeyword(item.id)}>
                    <span>
                      <strong>{item.keyword}</strong>
                      <small>
                        {rotuloPrioridade(item.priority)} · {rotuloStatus(item.status)}
                        {item.locality ? ` · ${item.locality}` : ""}
                      </small>
                    </span>
                    <Icone nome="chevron" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {editandoKeyword ? (
          <Sheet
            titulo={editandoKeyword === "new" ? "Nova palavra-chave" : "Editar palavra-chave"}
            aoFechar={() => setEditandoKeyword("")}
          >
            <div className="editor-keyword" data-seo-keyword>
              <label>
                Palavra-chave
                <input name="keyword" required defaultValue={keywordEmEdicao?.keyword ?? ""} placeholder="palavra-chave" />
              </label>
              <label>
                Intenção
                <select name="intent" defaultValue={keywordEmEdicao?.intent ?? "COMMERCIAL"}>
                  <option value="INFORMATIONAL">Informacional</option>
                  <option value="COMMERCIAL">Comercial</option>
                  <option value="TRANSACTIONAL">Transacional</option>
                  <option value="LOCAL">Local</option>
                  <option value="NAVIGATIONAL">Navegacional</option>
                </select>
              </label>
              <label>
                Localidade
                <input name="locality" defaultValue={keywordEmEdicao?.locality ?? ""} placeholder="localidade" />
              </label>
              <label>
                Prioridade
                <select name="priority" defaultValue={keywordEmEdicao?.priority ?? "MEDIUM"}>
                  <option value="HIGH">Alta</option>
                  <option value="MEDIUM">Média</option>
                  <option value="LOW">Baixa</option>
                </select>
              </label>
              <label>
                Volume estimado
                <input name="estimatedVolume" defaultValue={keywordEmEdicao?.estimatedVolume ?? ""} placeholder="volume estimado" />
              </label>
              <label>
                Página recomendada
                <input name="recommendedPage" defaultValue={keywordEmEdicao?.recommendedPage ?? ""} placeholder="página recomendada" />
              </label>
              <label>
                Status
                <select name="status" defaultValue={keywordEmEdicao?.status ?? "RECOMMENDED"}>
                  <option value="RECOMMENDED">Recomendada</option>
                  <option value="PLANNED">Planejada</option>
                  <option value="IN_PRODUCTION">Em produção</option>
                  <option value="PUBLISHED">Publicada</option>
                  <option value="PAUSED">Pausada</option>
                </select>
              </label>

              <div className="acoes-editor">
                <button
                  className="primary-button"
                  type="button"
                  disabled={savingKeyword !== ""}
                  onClick={(event) => {
                    const id = editandoKeyword === "new" ? undefined : editandoKeyword;
                    void saveKeyword(event, id).then(() => setEditandoKeyword(""));
                  }}
                >
                  {savingKeyword !== "" ? "Salvando..." : "Salvar"}
                </button>
                {editandoKeyword !== "new" ? (
                  <button
                    className="secondary-button danger-button"
                    type="button"
                    disabled={savingKeyword !== ""}
                    onClick={() => {
                      void deleteKeyword(editandoKeyword).then(() => setEditandoKeyword(""));
                    }}
                  >
                    Remover
                  </button>
                ) : null}
              </div>
            </div>
          </Sheet>
        ) : null}
      </section>

      <section className={activeTab === "assets" ? "dossier-tab active" : "dossier-tab"}>
        <GeradorDeIcones
          organizationId={organization.id}
          organizationName={organization.name}
          brandAssets={organization.brandAssets.map((item) => ({
            id: item.id,
            assetType: item.assetType,
            name: item.name,
            mimeType: item.mimeType ?? null,
            version: item.version,
            isCurrent: item.isCurrent ?? true,
          }))}
        />

        <div className="asset-upload-grid">
          {assetTypes.map((assetType) => {
            const versions = organization.brandAssets.filter((item) => item.assetType === assetType);
            const current = versions.find((item) => item.isCurrent) ?? versions[0];

            return (
              <article className="asset-upload-card" data-asset-card key={assetType}>
                <div>
                  <strong>{assetType}</strong>
                  <small>
                    {current
                      ? `Atual: ${current.name ?? "arquivo"} · v${current.version ?? "1"}`
                      : "Nenhum arquivo enviado"}
                  </small>
                </div>

                {current ? (
                  <a
                    className="asset-preview-link"
                    href={`/api/organizations/${organization.id}/brand-assets/${current.id}/preview`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir prévia
                  </a>
                ) : null}

                <div className="asset-upload-form">
                  <input
                    name="file"
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,.svg,.ico,.pdf,image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,application/pdf"
                    required
                  />
                  <input name="dimensions" placeholder="Dimensões, ex: 1200x630" />
                  <textarea name="notes" rows={2} placeholder="Observações da versão" />
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={(event) => uploadAsset(event, assetType)}
                    disabled={uploadingAsset === assetType}
                  >
                    {uploadingAsset === assetType ? "Enviando..." : "Enviar / substituir"}
                  </button>
                </div>

                {versions.length > 1 ? (
                  <details className="asset-history">
                    <summary>Histórico ({versions.length})</summary>
                    {versions.map((item) => (
                      <span key={item.id}>
                        v{item.version ?? "1"} · {item.name ?? "arquivo"} ·{" "}
                        {item.isCurrent ? "atual" : "anterior"}
                      </span>
                    ))}
                  </details>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <section className={activeTab === "integrations" ? "dossier-tab active" : "dossier-tab"}>
        <Grupo titulo="Google">
          <label>GA4 Measurement ID<input name="ga4" placeholder="G-XXXXXXXXXX" defaultValue={integrationByProvider.google_analytics_4?.publicId ?? ""} /></label>
          <label>Google Tag Manager<input name="gtm" placeholder="GTM-XXXXXXX" defaultValue={integrationByProvider.google_tag_manager?.publicId ?? ""} /></label>
          <label>Search Console<input name="searchConsole" defaultValue={integrationByProvider.google_search_console?.publicId ?? ""} /></label>
          <label>Google Ads ID<input name="googleAds" defaultValue={integrationByProvider.google_ads?.publicId ?? ""} /></label>
        </Grupo>

        <Grupo titulo="Meta" colunas="two">
          <label>Meta Pixel ID<input name="metaPixel" defaultValue={integrationByProvider.meta_pixel?.publicId ?? ""} /></label>
          <label>Meta Business ID<input name="metaBusiness" defaultValue={integrationByProvider.meta_business?.publicId ?? ""} /></label>
        </Grupo>

        <Grupo titulo="Mensageria" colunas="two">
          <label>WhatsApp Business<input name="whatsappBusiness" defaultValue={integrationByProvider.whatsapp_business?.publicId ?? ""} /></label>
          <label>E-mail transacional<input name="transactionalEmail" defaultValue={integrationByProvider.transactional_email?.publicId ?? ""} /></label>
        </Grupo>
        <p className="inline-feedback">Não salve senhas ou tokens aqui. Credenciais sensíveis devem usar o cofre de integrações.</p>
      </section>

      <section className={activeTab === "opportunities" ? "dossier-tab active" : "dossier-tab"}>
        {/* Cada serviço é um cartão: a situação de hoje e a oferta ficam juntas,
            porque a segunda só faz sentido lendo a primeira. Na grade de duas
            colunas anterior esse par se desfazia no celular e sobravam dez
            selects soltos sem dizer a qual serviço pertenciam. */}
        <div className="lista-servicos">
          <div className="cartao-servico">
            <h3>Catálogo PDF</h3>
            <div className="dossier-grid two">
              <label>Situação atual<select name="hasPdfCatalog" defaultValue={valueOf(organization.webPresence?.hasPdfCatalog)}><option value="">Não avaliado</option><option value="YES">Sim</option><option value="NO">Não</option><option value="IN_DEVELOPMENT">Em desenvolvimento</option><option value="NOT_APPLICABLE">Não se aplica</option></select></label>
              <label>Oferecer plano<select name="catalogOpportunityPlan" defaultValue=""><option value="">Não oferecer agora</option>{(planGroups.PDF_CATALOG ?? []).map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
            </div>
          </div>

          <div className="cartao-servico">
            <h3>Redes sociais</h3>
            <div className="dossier-grid two">
              <label>Quem administra<select name="socialMediaOwnerStatus" defaultValue={valueOf(organization.webPresence?.socialMediaOwnerStatus)}><option value="">Não avaliado</option><option value="INTERNAL_TEAM">Sim, equipe interna</option><option value="OUTSOURCED">Sim, terceirizado</option><option value="NO">Não</option><option value="OWNER">Proprietário administra</option></select></label>
              <label>Oferecer plano<select name="socialOpportunityPlan" defaultValue=""><option value="">Não oferecer agora</option>{(planGroups.SOCIAL_MEDIA ?? []).map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
            </div>
          </div>

          <div className="cartao-servico">
            <h3>E-mail profissional</h3>
            <div className="dossier-grid two">
              <label>Situação atual<select name="hasProfessionalEmail" defaultValue={valueOf(organization.webPresence?.hasProfessionalEmail)}><option value="">Não avaliado</option><option value="YES">Sim</option><option value="NO">Não</option><option value="NO_DOMAIN">Não possui domínio</option></select></label>
              <label>Oportunidade<select name="emailOpportunityStatus" defaultValue=""><option value="">Não avaliado</option><option value="OFFER_RECOMMENDED">Oferta recomendada</option><option value="INTERESTED">Interessado</option><option value="DECLINED">Recusado</option></select></label>
            </div>
          </div>

          <div className="cartao-servico">
            <h3>Identidade visual</h3>
            <div className="dossier-grid two">
              <label>Situação atual<select name="hasCompleteBrandIdentity" defaultValue={valueOf(organization.webPresence?.hasCompleteBrandIdentity)}><option value="">Não avaliado</option><option value="YES">Sim</option><option value="PARTIAL">Parcialmente</option><option value="NO">Não</option></select></label>
              <label>Oferecer plano<select name="brandOpportunityPlan" defaultValue=""><option value="">Não oferecer agora</option>{(planGroups.BRAND_IDENTITY ?? []).map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
            </div>
          </div>

          <div className="cartao-servico">
            <h3>Loja online</h3>
            <p className="aviso-servico">Em breve. Registre o interesse para entrar na fila.</p>
            <label className="switch-line"><input name="onlineStoreInterest" type="checkbox" defaultChecked={Boolean(organization.webPresence?.onlineStoreInterest)} /> Cliente tem interesse</label>
            <div className="dossier-grid two">
              <label>Lista de espera<select name="onlineStoreOpportunityStatus" defaultValue=""><option value="">Não avaliado</option><option value="WAITLIST">Entrar na lista de espera</option><option value="INTERESTED">Interessado</option></select></label>
              <label className="span-2">Notas da loja online<textarea name="onlineStoreNotes" rows={3} defaultValue={valueOf(organization.webPresence?.onlineStoreNotes)} placeholder="Produtos vendidos, quantidade aproximada, pagamento online, estoque, Odoo." /></label>
            </div>
          </div>
        </div>
      </section>

      <div className="dossier-actions">
        <Link className="secondary-button" href="/clientes">Voltar</Link>
        <button className="primary-button" type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar ficha"}</button>
      </div>
      {message ? <p className="inline-feedback feedback-success">{message}</p> : null}
      {error ? <p className="inline-feedback feedback-error">{error}</p> : null}

      {/* No celular o "Salvar" ficava no fim de uma página muito longa, atrás
          da barra de abas. Esta barra sobe quando algo muda e mora acima da
          navegação, respeitando a safe-area do iPhone. */}
      {temAlteracao ? (
        <div className="barra-acao" role="status">
          <span>Alterações não salvas</span>
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      ) : null}
    </form>
  );
}
