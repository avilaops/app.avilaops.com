import { notFound, redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import ClientDossierForm from "@/components/ClientDossierForm";
import OperacaoPanel from "@/components/OperacaoPanel";
import ProvisionamentoPanel from "@/components/ProvisionamentoPanel";
import { buscarContaPorEmail } from "@/lib/acesso-cliente";
import { getAdmin } from "@/lib/auth";
import { cofreDisponivel, resumirCredencial } from "@/lib/cofre";
import { prisma } from "@/lib/prisma";

export default async function ClientDossierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const { id } = await params;
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

  const cents = (valor: { toString(): string }) => Math.round(Number(valor.toString()) * 100);
  const assinaturas = organization.subscriptions.map((a) => ({
    id: a.id,
    description: a.description,
    amountCents: cents(a.amount),
    billingDay: a.billingDay,
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
    <AppShell adminName={admin.nome} section="clients">
      <header className="page-header">
        <div>
          <span className="eyebrow">Operação · Ficha do cliente</span>
          <h1>Cadastro completo e oportunidades.</h1>
          <p>
            Dados institucionais, presença digital, SEO, identidade, integrações
            e ofertas comerciais em uma única ficha operacional.
          </p>
        </div>
      </header>

      <ClientDossierForm
        organization={JSON.parse(JSON.stringify(organizacaoParaFicha))}
        plans={JSON.parse(JSON.stringify(plans))}
      />

      <ProvisionamentoPanel
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
        integracoes={organization.organizationIntegrations.map((item) => ({
          provider: item.provider,
          publicId: item.publicId,
          accountName: item.accountName,
          url: item.url,
          status: item.status,
          notes: item.notes,
        }))}
      />

      <OperacaoPanel
        organizationId={organization.id}
        nomeCliente={organization.name}
        assinaturas={assinaturas}
        planos={plans.map((p) => ({ id: p.id, name: p.name, serviceType: p.serviceType, priceCents: p.priceCents, billingCycle: p.billingCycle }))}
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
      />
    </AppShell>
  );
}
