import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import ClientDossierForm from "@/components/ClientDossierForm";
import ClientSectionNav from "@/components/ClientSectionNav";
import BrandsPanel from "@/components/BrandsPanel";
import OperacaoPanel from "@/components/OperacaoPanel";
import ProvisionamentoPanel from "@/components/ProvisionamentoPanel";
import { buscarContaPorEmail } from "@/lib/acesso-cliente";
import { getAdmin } from "@/lib/auth";
import { cofreDisponivel, resumirCredencial } from "@/lib/cofre";
import { listarCaixasDosDominios } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

export default async function ClientDossierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const { id } = await params;
  const requestedSection = (await searchParams).section;
  const section = ["summary", "registration", "services", "finance", "files"].includes(requestedSection ?? "") ? requestedSection! : "summary";
  const [organization, plans] = await Promise.all([
    prisma.organization.findUnique({
      where: { id },
      include: {
        profile: true,
        contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        addresses: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        socialProfiles: { orderBy: [{ platform: "asc" }] },
        webPresence: true,
        seoKeywords: { orderBy: [{ priority: "asc" }, { keyword: "asc" }] },
        brandAssets: { orderBy: [{ assetType: "asc" }, { createdAt: "desc" }] },
        files: { orderBy: [{ category: "asc" }, { createdAt: "desc" }] },
        onboardingSteps: { orderBy: [{ sortOrder: "asc" }, { label: "asc" }] },
        organizationIntegrations: true,
        serviceOpportunities: true,
        domains: {
          orderBy: { createdAt: "asc" },
          select: { id: true, fqdn: true, status: true, cloudflareStatus: true, cloudflareZoneId: true },
        },
        brands: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, slug: true, siteUrl: true, status: true } },
        integrationConnections: { orderBy: { provider: "asc" } },
        subscriptions: {
          orderBy: { createdAt: "desc" },
          include: {
            invoices: {
              orderBy: [{ dueDate: "desc" }],
              take: 12,
              include: { charges: { orderBy: { createdAt: "desc" }, take: 1 } },
            },
          },
        },
      },
    }),
    prisma.servicePlan.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ serviceType: "asc" }, { sortOrder: "asc" }],
    }),
  ]);

  if (!organization) notFound();

  const contatoPrincipal = organization.contacts[0] ?? null;
  const contatoEmail = contatoPrincipal?.email?.trim().toLowerCase() ?? "";
  const acessoExiste = contatoEmail ? Boolean(await buscarContaPorEmail(contatoEmail)) : false;

  // As caixas vêm do mail.avilaops.com a cada carregamento, não de espelho no
  // nosso banco. Até 10/09/2026 a ficha lia `organization_integrations`, que só
  // esta tela escrevia: caixa criada pelo /admin do auth ou na mão ficava
  // invisível aqui, e o botão "Criar caixa" respondia "já existe" sobre uma
  // caixa que a tela jurava não ter. Quem quer saber, pergunta à fonte.
  const mailData = section === "services"
    ? await listarCaixasDosDominios(organization.domains.filter((d) => d.status !== "ARCHIVED").map((d) => d.fqdn))
    : { caixas: [], dominiosComFalha: [] };
  const { caixas: caixasDoMail, dominiosComFalha: caixasComFalha } = mailData;

  const cents = (valor: { toString(): string }) => Math.round(Number(valor.toString()) * 100);
  const assinaturas = organization.subscriptions.map((a) => ({
    id: a.id,
    description: a.description,
    amountCents: cents(a.amount),
    billingDay: a.billingDay,
    billingCycle: a.billingCycle,
    status: a.status,
    startedAt: a.startedAt.toISOString(),
    productKey: a.productKey,
    productTenantId: a.productTenantId,
    invoices: a.invoices.map((f) => ({
      id: f.id,
      competence: f.competence,
      kind: f.kind,
      amountCents: cents(f.amount),
      dueDate: f.dueDate.toISOString(),
      status: f.status,
      paidAt: f.paidAt?.toISOString() ?? null,
      cobranca: f.charges[0]
        ? {
            method: f.charges[0].method,
            status: f.charges[0].status,
            pixCopyPaste: f.charges[0].pixCopyPaste,
            boletoUrl: f.charges[0].boletoUrl,
            boletoBarcode: f.charges[0].boletoBarcode,
            expiresAt: f.charges[0].expiresAt?.toISOString() ?? null,
          }
        : null,
    })),
  }));
  // A ficha (ClientDossierForm) não precisa das assinaturas nem das conexões
  // cifradas; tirar daqui evita mandar ciphertext ao navegador.
  const { subscriptions: _subscriptions, integrationConnections, ...organizacaoParaFicha } = organization;
  void _subscriptions;

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="clients">
      <header className="client-workspace-header"><Link href="/clientes" className="seo-back">‹ Clientes</Link><div><span className="eyebrow">ÁREA DE TRABALHO</span><h1>{organization.name}</h1><p>Nº {organization.clientNumber} · {organization.legalName ?? organization.slug} · <span className="seo-state good">{organization.status}</span></p></div></header>
      <ClientSectionNav clientId={id} active={section} />

      {section === "summary" ? <ClientSummary organization={organization} /> : null}
      {section === "registration" ? <ClientDossierForm key={`${id}-registration`} organization={JSON.parse(JSON.stringify(organizacaoParaFicha))} plans={JSON.parse(JSON.stringify(plans))} initialTab="registration" /> : null}
      {section === "files" ? <ClientDossierForm key={`${id}-files`} organization={JSON.parse(JSON.stringify(organizacaoParaFicha))} plans={JSON.parse(JSON.stringify(plans))} initialTab="assets" /> : null}
      {section === "services" ? <ProvisionamentoPanel
        organizationId={organization.id}
        nome={organization.name}
        slug={organization.slug}
        contato={
          contatoPrincipal
            ? {
                nome: contatoPrincipal.name,
                email: contatoPrincipal.email ?? null,
                telefone: contatoPrincipal.phone ?? contatoPrincipal.whatsapp ?? null,
              }
            : null
        }
        acessoExiste={acessoExiste}
        dominios={organization.domains}
        caixas={caixasDoMail}
        caixasComFalha={caixasComFalha}
        integracoes={organization.organizationIntegrations.map((item) => ({
          provider: item.provider,
          publicId: item.publicId,
          accountName: item.accountName,
          url: item.url,
          status: item.status,
          notes: item.notes,
        }))}
      /> : null}

      {section === "finance" ? <div className="client-finance-only"><OperacaoPanel
        organizationId={organization.id}
        nomeCliente={organization.name}
        assinaturas={assinaturas}
        planos={plans.map((p) => ({ id: p.id, name: p.name, serviceType: p.serviceType, priceCents: p.priceCents, currency: p.currency, billingCycle: p.billingCycle }))}
        marcas={organization.brands}
        credenciais={integrationConnections.map(resumirCredencial)}
        etapas={organization.onboardingSteps.map((e) => ({
          stepKey: e.stepKey,
          label: e.label,
          status: e.status,
          completedAt: e.completedAt?.toISOString() ?? null,
          notes: e.notes,
        }))}
        cofreDisponivel={cofreDisponivel()}
      /></div> : null}
    </AppShell>
  );
}

// The page query owns this complete relational payload; the summary never serializes secrets.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ClientSummary({ organization }: { organization: any }) {
  const contact = organization.contacts[0];
  const activeSubscriptions = organization.subscriptions.filter((item: { status: string }) => item.status === "ACTIVE");
  const pendingStep = organization.onboardingSteps.find((item: { status: string }) => item.status !== "DONE");
  const completed = organization.onboardingSteps.filter((item: { status: string }) => item.status === "DONE").length;
  const total = organization.onboardingSteps.length;
  return <div className="client-summary-grid">
    <section className="client-summary-lead"><span className="eyebrow">PRÓXIMA AÇÃO</span><h2>{pendingStep?.label ?? "Operação em dia"}</h2><p>{pendingStep?.notes ?? (pendingStep ? "Esta é a próxima etapa registrada da implantação." : total ? "Todas as etapas registradas foram concluídas." : "Ainda não há etapas de implantação registradas.")}</p>{pendingStep ? <Link href={`/clientes/${organization.id}?section=services`}>Ver implantação</Link> : null}</section>
    <section className="client-summary-section"><div className="seo-section-heading"><h2>Essencial</h2><Link href={`/clientes/${organization.id}?section=registration`}>Ver cadastro</Link></div><dl><div><dt>Contato principal</dt><dd>{contact?.name ?? "Não informado"}</dd></div><div><dt>E-mail</dt><dd>{contact?.email ?? "Não informado"}</dd></div><div><dt>Telefone</dt><dd>{contact?.phone ?? contact?.whatsapp ?? "Não informado"}</dd></div></dl></section>
    <section className="client-summary-section"><div className="seo-section-heading"><h2>Serviços</h2><Link href={`/clientes/${organization.id}?section=services`}>Gerenciar</Link></div><strong className="client-summary-number">{activeSubscriptions.length}</strong><p>{activeSubscriptions.length === 1 ? "serviço recorrente ativo" : "serviços recorrentes ativos"}</p><small>{organization.domains.length} domínios · {organization.organizationIntegrations.length} integrações</small></section>
    <section className="client-summary-section"><div className="seo-section-heading"><h2>Implantação</h2><Link href={`/clientes/${organization.id}?section=services`}>Ver etapas</Link></div><strong className="client-summary-number">{total ? Math.round(completed / total * 100) : 0}%</strong><p>{completed} de {total} etapas registradas concluídas</p><small>Este indicador mede apenas as etapas cadastradas, não a completude cadastral.</small></section>
    <section className="client-summary-section"><div className="seo-section-heading"><h2>Financeiro</h2><Link href={`/clientes/${organization.id}?section=finance`}>Ver financeiro</Link></div><strong className="client-summary-number">{organization.subscriptions.length}</strong><p>{organization.subscriptions.length === 1 ? "assinatura cadastrada" : "assinaturas cadastradas"}</p></section>
    <BrandsPanel organizationId={organization.id} brands={organization.brands} />
  </div>;
}
