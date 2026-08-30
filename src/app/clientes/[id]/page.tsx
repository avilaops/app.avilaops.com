import { notFound, redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import ClientDossierForm from "@/components/ClientDossierForm";
import ProvisionamentoPanel from "@/components/ProvisionamentoPanel";
import { buscarContaPorEmail } from "@/lib/acesso-cliente";
import { getAdmin } from "@/lib/auth";
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
          select: { id: true, fqdn: true, cloudflareStatus: true, cloudflareZoneId: true },
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
        organization={JSON.parse(JSON.stringify(organization))}
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
    </AppShell>
  );
}
