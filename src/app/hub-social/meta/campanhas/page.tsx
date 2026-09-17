import { redirect } from "next/navigation";
import BadgeStatus from "@/components/hub-social/BadgeStatus";
import CabecalhoPagina from "@/components/hub-social/CabecalhoPagina";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import GradeMetricas, { Metrica } from "@/components/hub-social/Metricas";
import TabelaResponsiva, { type LinhaTabela } from "@/components/hub-social/TabelaResponsiva";
import { brutoSeguro, evidenciaDeRegistro, statusContaAnuncio } from "@/components/meta/evidencia-meta";
import PainelMeta from "@/components/meta/PainelMeta";
import MetaCampaignSyncButton from "@/components/MetaCampaignSyncButton";
import MetaClientSelect from "@/components/MetaClientSelect";
import MetaOperationsNav from "@/components/MetaOperationsNav";
import { getAdmin } from "@/lib/auth";
import type { Evidencia } from "@/lib/evidencia";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { rotuloObjetivo } from "@/lib/status-rotulos";

const ORIGEM_SNAPSHOTS = "prisma.metaCampaignSnapshot.findMany em src/app/hub-social/meta/campanhas/page.tsx";

export default async function MetaCampaignsPage({
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

  const [adAccounts, snapshots] = selectedOrganizationId
    ? await Promise.all([
        prisma.metaAdAccount.findMany({
          where: { organizationId: selectedOrganizationId },
          orderBy: { name: "asc" },
          include: { businessAccount: true },
        }),
        prisma.metaCampaignSnapshot.findMany({
          where: { organizationId: selectedOrganizationId },
          orderBy: { capturedAt: "desc" },
          take: 100,
          include: { adAccount: true },
        }),
      ])
    : [[], []];

  const spend = snapshots.reduce(
    (total, snapshot) => total + Number(snapshot.spend ?? 0),
    0,
  );
  const impressions = snapshots.reduce(
    (total, snapshot) => total + (snapshot.impressions ?? 0),
    0,
  );
  const leads = snapshots.reduce((total, snapshot) => total + (snapshot.leads ?? 0), 0);

  const hrefConexao = `/hub-social/meta?organizationId=${encodeURIComponent(selectedOrganizationId)}`;
  const snapshotMaisRecente = snapshots[0]?.capturedAt.toISOString() ?? null;

  const evidenciaSoma = (rotulo: string, formula: string, campo: "spend" | "impressions" | "leads"): Evidencia => ({
    rotulo,
    origem: ORIGEM_SNAPSHOTS,
    formula,
    lidoEm,
    gravadoEm: snapshotMaisRecente,
    referencia: selectedOrganizationId || null,
    observacao: "Gravado em = capturedAt do snapshot mais recente. Referência = organizationId usado no filtro.",
    bruto: brutoSeguro(
      snapshots.map((snapshot) => ({
        id: snapshot.id,
        campaignId: snapshot.campaignId,
        capturedAt: snapshot.capturedAt,
        [campo]: snapshot[campo],
      })),
    ),
  });

  const evidenciaQuantidade: Evidencia = {
    rotulo: "Snapshots",
    origem: ORIGEM_SNAPSHOTS,
    formula: "quantidade de snapshots retornados (ordenados por capturedAt desc, limite de 100)",
    lidoEm,
    gravadoEm: snapshotMaisRecente,
    referencia: selectedOrganizationId || null,
    observacao: "Gravado em = capturedAt do snapshot mais recente. Referência = organizationId usado no filtro.",
    bruto: brutoSeguro(
      snapshots.map((snapshot) => ({ id: snapshot.id, campaignId: snapshot.campaignId, capturedAt: snapshot.capturedAt })),
    ),
  };

  const botaoColeta = <MetaCampaignSyncButton organizationId={selectedOrganizationId} />;

  const linhasSnapshots: LinhaTabela[] = snapshots.map((snapshot) => ({
    id: snapshot.id,
    celulas: {
      campanha: snapshot.campaignName ?? snapshot.campaignId,
      conta: snapshot.adAccount?.name,
      status: snapshot.status ? <BadgeStatus status={snapshot.status} /> : null,
      objetivo: rotuloObjetivo(snapshot.objective),
      gasto: formatCurrency(snapshot.spend?.toString()),
      impressoes: (snapshot.impressions ?? 0).toLocaleString("pt-BR"),
      cliques: (snapshot.clicks ?? 0).toLocaleString("pt-BR"),
      leads: snapshot.leads ?? 0,
      capturado: formatDateTime(snapshot.capturedAt),
    },
    evidencia: evidenciaDeRegistro({
      rotulo: snapshot.campaignName ?? snapshot.campaignId,
      modelo: "metaCampaignSnapshot",
      id: snapshot.id,
      gravadoEm: snapshot.capturedAt,
      campoGravadoEm: "capturedAt",
      lidoEm,
      registro: snapshot,
      funcao: "syncMetaCampaignInsights() em src/lib/meta.ts",
    }),
  }));

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

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Campanhas da Meta"
        subtitulo="Verba, tráfego e resultado de cada campanha."
        acoes={botaoColeta}
      />

      <MetaOperationsNav active="campaigns" organizationId={selectedOrganizationId} />
      <MetaClientSelect
        organizations={organizations}
        selectedOrganizationId={selectedOrganizationId}
        action="/hub-social/meta/campanhas"
      />

      <GradeMetricas rotulo="Resultado das campanhas">
        <Metrica
          rotulo="Investimento"
          valor={formatCurrency(spend)}
          destaque
          href="#snapshots"
          evidencia={evidenciaSoma("Investimento", "soma de spend dos últimos 100 snapshots", "spend")}
        />
        <Metrica rotulo="Snapshots" valor={snapshots.length} href="#snapshots" evidencia={evidenciaQuantidade} />
        <Metrica
          rotulo="Impressões"
          valor={impressions.toLocaleString("pt-BR")}
          href="#snapshots"
          evidencia={evidenciaSoma("Impressões", "soma de impressions dos últimos 100 snapshots", "impressions")}
        />
        <Metrica
          rotulo="Leads"
          valor={leads}
          href="#snapshots"
          evidencia={evidenciaSoma("Leads", "soma de leads dos últimos 100 snapshots", "leads")}
        />
      </GradeMetricas>

      <PainelMeta id="snapshots" titulo="Snapshots de campanha" descricao="Últimos 100 registros capturados.">
        {linhasSnapshots.length === 0 ? (
          <EstadoVazio
            compacto
            titulo="Nenhum snapshot de campanha ainda."
            descricao="A coleta é manual por enquanto."
            acao={botaoColeta}
          />
        ) : (
          <TabelaResponsiva
            rotulo="Snapshots de campanha"
            colunas={[
              { chave: "campanha", rotulo: "Campanha", principal: true },
              { chave: "conta", rotulo: "Conta" },
              { chave: "status", rotulo: "Status" },
              { chave: "objetivo", rotulo: "Objetivo" },
              { chave: "gasto", rotulo: "Gasto", alinhar: "direita" },
              { chave: "impressoes", rotulo: "Impressões", alinhar: "direita" },
              { chave: "cliques", rotulo: "Cliques", alinhar: "direita" },
              { chave: "leads", rotulo: "Leads", alinhar: "direita" },
              { chave: "capturado", rotulo: "Capturado" },
            ]}
            linhas={linhasSnapshots}
          />
        )}
      </PainelMeta>

      <PainelMeta
        id="origem"
        titulo="Origem das campanhas"
        descricao={`${adAccounts.length} contas de anúncio importadas.`}
      >
        {linhasContas.length === 0 ? (
          <EstadoVazio
            compacto
            titulo="Nenhuma conta de anúncio importada."
            descricao="Conecte ou sincronize a Meta para trazer as contas de anúncio do cliente."
            acao={{ label: "Conectar ou sincronizar a Meta", href: hrefConexao }}
          />
        ) : (
          <TabelaResponsiva
            rotulo="Origem das campanhas"
            colunas={[
              { chave: "conta", rotulo: "Conta", principal: true },
              { chave: "id", rotulo: "ID Meta", mono: true },
              { chave: "business", rotulo: "Portfólio" },
              { chave: "moeda", rotulo: "Moeda", mono: true },
              { chave: "status", rotulo: "Status" },
            ]}
            linhas={linhasContas}
          />
        )}
      </PainelMeta>
    </div>
  );
}
