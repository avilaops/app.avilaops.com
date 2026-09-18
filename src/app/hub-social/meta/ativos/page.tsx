import { redirect } from "next/navigation";
import BadgeStatus from "@/components/sistema/Status";
import CabecalhoPagina from "@/components/hub-social/CabecalhoPagina";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import GradeMetricas, { Metrica } from "@/components/hub-social/Metricas";
import TabelaResponsiva, { type LinhaTabela } from "@/components/hub-social/TabelaResponsiva";
import { brutoSeguro, evidenciaDeRegistro, statusContaAnuncio } from "@/components/meta/evidencia-meta";
import PainelMeta from "@/components/meta/PainelMeta";
import MetaClientSelect from "@/components/MetaClientSelect";
import MetaOperationsNav from "@/components/MetaOperationsNav";
import { getAdmin } from "@/lib/auth";
import type { Evidencia } from "@/lib/evidencia";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";

const ARQUIVO = "src/app/hub-social/meta/ativos/page.tsx";

export default async function MetaAssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ organizationId?: string }>;
}) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const params = await searchParams;
  const lidoEm = new Date().toISOString();
  const organizations = await prisma.organization.findMany({
    where: { status: { not: "ARCHIVED" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, status: true },
  });
  const selectedOrganizationId = params.organizationId || organizations[0]?.id || "";

  const [businesses, pages, instagramAccounts, adAccounts] = selectedOrganizationId
    ? await Promise.all([
        prisma.metaBusinessAccount.findMany({
          where: { organizationId: selectedOrganizationId },
          orderBy: { name: "asc" },
        }),
        prisma.metaPage.findMany({
          where: { organizationId: selectedOrganizationId },
          orderBy: { name: "asc" },
          include: { instagramAccounts: true },
        }),
        prisma.instagramAccount.findMany({
          where: { organizationId: selectedOrganizationId },
          orderBy: { username: "asc" },
          include: { page: true },
        }),
        prisma.metaAdAccount.findMany({
          where: { organizationId: selectedOrganizationId },
          orderBy: { name: "asc" },
          include: { businessAccount: true },
        }),
      ])
    : [[], [], [], []];

  const organizationQuery = `organizationId=${encodeURIComponent(selectedOrganizationId)}`;
  const hrefConexao = `/hub-social/meta?${organizationQuery}`;
  const acaoConectar = { label: "Conectar ou sincronizar a Meta", href: hrefConexao };

  const evidenciaContagem = (rotulo: string, modelo: string, tabela: string, registros: unknown): Evidencia => ({
    rotulo,
    origem: `prisma.${modelo}.findMany em ${ARQUIVO}`,
    formula: `quantidade de registros de ${tabela} com organizationId do cliente selecionado`,
    lidoEm,
    referencia: selectedOrganizationId || null,
    observacao: "Referência = organizationId usado no filtro.",
    bruto: brutoSeguro(registros),
  });

  const linhasPresenca: LinhaTabela[] = [
    ...pages.map((page) => ({
      id: `page-${page.id}`,
      celulas: {
        tipo: "Página do Facebook",
        nome: page.name,
        identificador: page.username ?? page.pageId,
        vinculo: `${page.instagramAccounts.length} Instagram`,
        sync: formatDateTime(page.lastSyncedAt),
      },
      evidencia: evidenciaDeRegistro({
        rotulo: page.name,
        modelo: "metaPage",
        id: page.id,
        gravadoEm: page.lastSyncedAt,
        campoGravadoEm: "lastSyncedAt",
        lidoEm,
        registro: page,
        funcao: "syncMetaBusiness() em src/lib/meta.ts",
      }),
    })),
    ...instagramAccounts.map((account) => ({
      id: `instagram-${account.id}`,
      celulas: {
        tipo: "Instagram",
        nome: account.name ?? account.username,
        identificador: `@${account.username}`,
        vinculo: account.page?.name ?? "Sem página vinculada",
        sync: formatDateTime(account.lastSyncedAt),
      },
      evidencia: evidenciaDeRegistro({
        rotulo: `@${account.username}`,
        modelo: "instagramAccount",
        id: account.id,
        gravadoEm: account.lastSyncedAt,
        campoGravadoEm: "lastSyncedAt",
        lidoEm,
        registro: account,
        funcao: "syncMetaBusiness() em src/lib/meta.ts",
      }),
    })),
  ];

  const linhasContas: LinhaTabela[] = adAccounts.map((account) => ({
    id: account.id,
    celulas: {
      conta: account.name,
      id: account.adAccountId,
      business: account.businessAccount?.name,
      moeda: account.currency,
      status: (
        <BadgeStatus
          status={statusContaAnuncio(account.accountStatus, account.status)}
          titulo={account.accountStatus ? `account_status ${account.accountStatus}` : account.status}
        />
      ),
      sync: formatDateTime(account.lastSyncedAt),
    },
    evidencia: evidenciaDeRegistro({
      rotulo: account.name,
      modelo: "metaAdAccount",
      id: account.id,
      gravadoEm: account.lastSyncedAt,
      campoGravadoEm: "lastSyncedAt",
      lidoEm,
      registro: account,
      funcao: "syncMetaBusiness() em src/lib/meta.ts",
    }),
  }));

  const linhasPortfolios: LinhaTabela[] = businesses.map((business) => ({
    id: business.id,
    celulas: {
      nome: business.name,
      id: business.businessId,
      verificacao: business.verificationStatus ? <BadgeStatus status={business.verificationStatus} /> : null,
      fuso: business.timezone,
      sync: formatDateTime(business.lastSyncedAt),
    },
    evidencia: evidenciaDeRegistro({
      rotulo: business.name,
      modelo: "metaBusinessAccount",
      id: business.id,
      gravadoEm: business.lastSyncedAt,
      campoGravadoEm: "lastSyncedAt",
      lidoEm,
      registro: business,
      funcao: "syncMetaBusiness() em src/lib/meta.ts",
    }),
  }));

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Ativos da Meta"
        subtitulo="Portfólios empresariais, páginas, Instagram e contas de anúncio por organização."
      />

      <MetaOperationsNav active="assets" organizationId={selectedOrganizationId} />
      <MetaClientSelect
        organizations={organizations}
        selectedOrganizationId={selectedOrganizationId}
        action="/hub-social/meta/ativos"
      />

      <GradeMetricas rotulo="Ativos importados">
        <Metrica
          rotulo="Business Managers"
          valor={businesses.length}
          href="#portfolios"
          evidencia={evidenciaContagem(
            "Business Managers",
            "metaBusinessAccount",
            "meta_business_accounts",
            businesses,
          )}
        />
        <Metrica
          rotulo="Páginas"
          valor={pages.length}
          href="#presenca"
          evidencia={evidenciaContagem("Páginas", "metaPage", "meta_pages", pages)}
        />
        <Metrica
          rotulo="Instagram"
          valor={instagramAccounts.length}
          href="#presenca"
          evidencia={evidenciaContagem("Instagram", "instagramAccount", "instagram_accounts", instagramAccounts)}
        />
        <Metrica
          rotulo="Contas de anúncio"
          valor={adAccounts.length}
          href="#contas"
          evidencia={evidenciaContagem("Contas de anúncio", "metaAdAccount", "meta_ad_accounts", adAccounts)}
        />
      </GradeMetricas>

      <PainelMeta id="presenca" titulo="Presença conectada" descricao="Páginas e Instagram retornados pela Graph API.">
        {linhasPresenca.length === 0 ? (
          <EstadoVazio
            compacto
            titulo="Nenhuma página ou Instagram importado."
            descricao="Conecte ou sincronize a Meta para preencher este inventário."
            acao={acaoConectar}
          />
        ) : (
          <TabelaResponsiva
            rotulo="Presença conectada"
            colunas={[
              { chave: "nome", rotulo: "Nome", principal: true },
              { chave: "tipo", rotulo: "Tipo" },
              { chave: "identificador", rotulo: "Identificador", mono: true },
              { chave: "vinculo", rotulo: "Vínculo" },
              { chave: "sync", rotulo: "Última sincronização" },
            ]}
            linhas={linhasPresenca}
          />
        )}
      </PainelMeta>

      <PainelMeta id="contas" titulo="Contas de anúncio" descricao="Base para métricas e campanhas.">
        {linhasContas.length === 0 ? (
          <EstadoVazio
            compacto
            titulo="Nenhuma conta de anúncio importada."
            descricao="A conta autorizada precisa ter acesso às contas de anúncio do cliente."
            acao={acaoConectar}
          />
        ) : (
          <TabelaResponsiva
            rotulo="Contas de anúncio"
            colunas={[
              { chave: "conta", rotulo: "Conta", principal: true },
              { chave: "id", rotulo: "ID Meta", mono: true },
              { chave: "business", rotulo: "Portfólio" },
              { chave: "moeda", rotulo: "Moeda", mono: true },
              { chave: "status", rotulo: "Status" },
              { chave: "sync", rotulo: "Última sincronização" },
            ]}
            linhas={linhasContas}
          />
        )}
      </PainelMeta>

      <PainelMeta id="portfolios" titulo="Portfólios empresariais" descricao="Origem dos ativos importados.">
        {linhasPortfolios.length === 0 ? (
          <EstadoVazio
            compacto
            titulo="Nenhum Business Manager importado."
            descricao="Conecte ou sincronize a Meta para trazer os portfólios do cliente."
            acao={acaoConectar}
          />
        ) : (
          <TabelaResponsiva
            rotulo="Portfólios empresariais"
            colunas={[
              { chave: "nome", rotulo: "Nome", principal: true },
              { chave: "id", rotulo: "ID Meta", mono: true },
              { chave: "verificacao", rotulo: "Verificação" },
              { chave: "fuso", rotulo: "Fuso", mono: true },
              { chave: "sync", rotulo: "Última sincronização" },
            ]}
            linhas={linhasPortfolios}
          />
        )}
      </PainelMeta>
    </div>
  );
}
