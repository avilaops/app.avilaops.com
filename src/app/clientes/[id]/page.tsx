import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import AcoesCliente from "@/components/clientes/AcoesCliente";
import BancoDeDadosPanel from "@/components/banco-cliente/BancoDeDadosPanel";
import CadastroAssistidoPanel from "@/components/CadastroAssistidoPanel";
import ClientDossierForm from "@/components/ClientDossierForm";
import ClientSectionNav from "@/components/ClientSectionNav";
import { Grupo, LinhaInfo, LinhaLink } from "@/components/sistema/Lista";
import BadgeStatus from "@/components/sistema/Status";
import BrandsPanel from "@/components/BrandsPanel";
import OperacaoPanel from "@/components/OperacaoPanel";
import ProvisionamentoPanel from "@/components/ProvisionamentoPanel";
import { buscarContaPorEmail } from "@/lib/acesso-cliente";
import { ehDono, getAdmin } from "@/lib/auth";
import { contar, nomeProprio } from "@/lib/format";
import { pendenciasDoCadastro } from "@/lib/pendencias-cadastro";
import { montarPainel } from "@/lib/cadastro-ia/assistente";
import { cofreDisponivel, resumirCredencial } from "@/lib/cofre";
import { listarCaixasDosDominios } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import NucleoDaEmpresa from "@/components/NucleoDaEmpresa";

export default async function ClientDossierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ section?: string; banco?: string; q?: string; tabela?: string; vazias?: string }>;
}) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const { id } = await params;
  const query = await searchParams;
  const requestedSection = query.section;
  const section = ["summary", "registration", "services", "finance", "files", "database"].includes(requestedSection ?? "") ? requestedSection! : "summary";
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

  // Só a aba de cadastro usa o assistente; nas outras a consulta extra seria
  // desperdício em cada carregamento de página.
  const painelAssistente = section === "registration" ? await montarPainel(id) : null;

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="clients">
      {/* O estado saía cru ("ACTIVE") e o subtítulo mostrava o slug quando não
          havia razão social — identificador interno na linha de identidade do
          cliente. Agora é o selo da casa, com o rótulo do mapa único. */}
      <header className="client-workspace-header">
        <div className="client-workspace-titulo">
          <Link href="/clientes" className="seo-back">‹ Clientes</Link>
          <h1>{nomeProprio(organization.name)}</h1>
          <p>
            Nº {organization.clientNumber}
            {organization.legalName ? ` · ${organization.legalName}` : ""}{" "}
            <BadgeStatus status={organization.status} />
          </p>
        </div>
        <div className="client-workspace-acoes">
          <AcoesCliente
            id={organization.id}
            nome={organization.name}
            status={organization.status}
            podeExcluir={ehDono(admin.role)}
            aoExcluirIrPara="/clientes"
          />
        </div>
      </header>
      <ClientSectionNav clientId={id} active={section} />

      {section === "summary" ? <ClientSummary organization={organization} /> : null}
      {section === "summary" ? <NucleoDaEmpresa identityId={admin.id} organizationId={id} /> : null}
      {section === "registration" && painelAssistente ? <CadastroAssistidoPanel painelInicial={JSON.parse(JSON.stringify(painelAssistente))} /> : null}
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

      {section === "database" ? <BancoDeDadosPanel organizationId={organization.id} filtro={{ banco: query.banco, q: query.q, tabela: query.tabela, vazias: query.vazias === "1" }} /> : null}

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
  // Sem etapa pendente o cartão dizia "Operação em dia" até para cliente
  // recém-criado, sem contato nem domínio. Cadastro incompleto é a próxima ação.
  const faltando = pendenciasDoCadastro(organization);
  const proxima = pendingStep
    ? { titulo: pendingStep.label, texto: pendingStep.notes ?? "Esta é a próxima etapa registrada da implantação.", href: `/clientes/${organization.id}?section=services`, link: "Ver implantação" }
    : faltando.length
      ? { titulo: "Completar cadastro", texto: `Falta: ${faltando.join(", ")}.`, href: `/clientes/${organization.id}?section=registration`, link: "Completar cadastro" }
      : { titulo: "Operação em dia", texto: total ? "Todas as etapas registradas foram concluídas." : "Cadastro completo. Ainda não há etapas de implantação registradas.", href: null, link: null };
  return <div className="client-summary-grid">
    <section className="client-summary-lead"><span className="eyebrow">PRÓXIMA AÇÃO</span><h2>{proxima.titulo}</h2><p>{proxima.texto}</p>{proxima.href ? <Link href={proxima.href}>{proxima.link}</Link> : null}</section>

    {/* Três cartões de 190px para três números quase sempre em zero viraram
        três linhas de uma lista agrupada — o mesmo padrão da Visão central. A
        linha inteira é o link, então o "Gerenciar / Ver etapas / Ver
        financeiro" que repetia o destino ao lado do título sai junto. */}
    <Grupo titulo="Essencial" acao={<Link href={`/clientes/${organization.id}?section=registration`}>Ver cadastro</Link>}>
      <LinhaInfo titulo="Contato principal" valor={contact?.name ? nomeProprio(contact.name) : "Não informado"} />
      <LinhaInfo titulo="E-mail" valor={contact?.email ?? "Não informado"} />
      <LinhaInfo titulo="Telefone" valor={contact?.phone ?? contact?.whatsapp ?? "Não informado"} />
    </Grupo>

    <Grupo titulo="Onde este cliente está">
      <LinhaLink
        href={`/clientes/${organization.id}?section=services`}
        titulo="Serviços recorrentes"
        descricao={`${contar(organization.domains.length, "domínio", "domínios")} · ${contar(organization.organizationIntegrations.length, "integração", "integrações")}`}
        icone="config"
        valor={<strong className="linha-numero">{activeSubscriptions.length}</strong>}
      />
      <LinhaLink
        href={`/clientes/${organization.id}?section=services`}
        titulo="Implantação"
        descricao={total ? `${completed} de ${total} etapas registradas concluídas` : "Nenhuma etapa registrada ainda"}
        icone="operacao"
        valor={<strong className="linha-numero">{total ? Math.round(completed / total * 100) : 0}%</strong>}
      />
      <LinhaLink
        href={`/clientes/${organization.id}?section=finance`}
        titulo="Financeiro"
        descricao={contar(organization.subscriptions.length, "assinatura cadastrada", "assinaturas cadastradas")}
        icone="financeiro"
        valor={<strong className="linha-numero">{organization.subscriptions.length}</strong>}
      />
    </Grupo>

    <BrandsPanel organizationId={organization.id} brands={organization.brands} />
  </div>;
}
