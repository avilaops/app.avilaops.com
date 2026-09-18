import { redirect } from "next/navigation";
import BadgeStatus from "@/components/sistema/Status";
import CabecalhoPagina from "@/components/hub-social/CabecalhoPagina";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import GradeMetricas, { Metrica } from "@/components/hub-social/Metricas";
import TabelaResponsiva, { type LinhaTabela } from "@/components/hub-social/TabelaResponsiva";
import { brutoSeguro, evidenciaDeRegistro } from "@/components/meta/evidencia-meta";
import PainelMeta from "@/components/meta/PainelMeta";
import MetaClientSelect from "@/components/MetaClientSelect";
import MetaLeadConvertButton from "@/components/MetaLeadConvertButton";
import MetaOperationsNav from "@/components/MetaOperationsNav";
import { getAdmin } from "@/lib/auth";
import type { Evidencia } from "@/lib/evidencia";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";

const ARQUIVO = "src/app/hub-social/meta/leads/page.tsx";

function countJsonItems(value: unknown) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return 0;
}

export default async function MetaLeadsPage({
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

  const [forms, leads] = selectedOrganizationId
    ? await Promise.all([
        prisma.metaLeadForm.findMany({
          where: { organizationId: selectedOrganizationId },
          orderBy: [{ status: "asc" }, { name: "asc" }],
          include: { page: true, adAccount: true },
        }),
        prisma.metaLead.findMany({
          where: { organizationId: selectedOrganizationId },
          orderBy: { createdTime: "desc" },
          take: 80,
          include: { form: true, page: true, adAccount: true, lead: true },
        }),
      ])
    : [[], []];

  const newLeads = leads.filter((lead) => lead.processingStatus === "NEW").length;
  const convertedLeads = leads.filter((lead) => Boolean(lead.leadId)).length;

  const hrefConexao = `/hub-social/meta?organizationId=${encodeURIComponent(selectedOrganizationId)}`;

  const resumoLeads = (filtro: (lead: (typeof leads)[number]) => boolean) =>
    brutoSeguro(
      leads.filter(filtro).map((lead) => ({
        id: lead.id,
        leadgenId: lead.leadgenId,
        processingStatus: lead.processingStatus,
        leadId: lead.leadId,
        createdTime: lead.createdTime,
      })),
    );

  const evidenciaLeads = (rotulo: string, formula: string, bruto: unknown): Evidencia => ({
    rotulo,
    origem: `prisma.metaLead.findMany em ${ARQUIVO}`,
    formula,
    lidoEm,
    gravadoEm: leads[0]?.createdTime?.toISOString() ?? null,
    referencia: selectedOrganizationId || null,
    observacao:
      "Gravado em = createdTime do lead mais recente. Referência = organizationId usado no filtro.",
    bruto,
  });

  const evidenciaFormularios: Evidencia = {
    rotulo: "Formulários",
    origem: `prisma.metaLeadForm.findMany em ${ARQUIVO}`,
    formula: "quantidade de registros de meta_lead_forms com organizationId do cliente selecionado",
    lidoEm,
    referencia: selectedOrganizationId || null,
    observacao: "Referência = organizationId usado no filtro.",
    bruto: brutoSeguro(
      forms.map((form) => ({ id: form.id, formId: form.formId, status: form.status, lastSyncedAt: form.lastSyncedAt })),
    ),
  };

  const linhasFormularios: LinhaTabela[] = forms.map((form) => ({
    id: form.id,
    celulas: {
      formulario: form.name,
      status: <BadgeStatus status={form.status} />,
      pagina: form.page?.name,
      conta: form.adAccount?.name,
      perguntas: countJsonItems(form.questions),
      sync: formatDateTime(form.lastSyncedAt),
    },
    evidencia: evidenciaDeRegistro({
      rotulo: form.name,
      modelo: "metaLeadForm",
      id: form.id,
      gravadoEm: form.lastSyncedAt,
      campoGravadoEm: "lastSyncedAt",
      lidoEm,
      registro: form,
      funcao: "syncMetaBusiness() em src/lib/meta.ts",
    }),
  }));

  const linhasFila: LinhaTabela[] = leads.map((lead) => ({
    id: lead.id,
    celulas: {
      formulario: lead.form?.name ?? lead.leadgenId,
      criado: formatDateTime(lead.createdTime),
      status: <BadgeStatus status={lead.processingStatus} />,
      pagina: lead.page?.name,
      campos: countJsonItems(lead.fieldData),
      crm: lead.lead?.companyName ?? lead.lead?.contactName ?? "Aguardando",
    },
    acao: <MetaLeadConvertButton metaLeadId={lead.id} converted={Boolean(lead.leadId)} />,
    evidencia: evidenciaDeRegistro({
      rotulo: lead.form?.name ?? lead.leadgenId,
      modelo: "metaLead",
      id: lead.id,
      gravadoEm: lead.createdTime,
      campoGravadoEm: "createdTime",
      lidoEm,
      registro: lead,
      funcao: "processMetaWebhookPayload() em src/lib/meta.ts",
    }),
  }));

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Leads da Meta"
        subtitulo="Formulários, leads recebidos e status de processamento."
      />

      <MetaOperationsNav active="leads" organizationId={selectedOrganizationId} />
      <MetaClientSelect
        organizations={organizations}
        selectedOrganizationId={selectedOrganizationId}
        action="/hub-social/meta/leads"
      />

      <GradeMetricas rotulo="Captação de leads">
        <Metrica rotulo="Formulários" valor={forms.length} href="#fontes" evidencia={evidenciaFormularios} />
        <Metrica
          rotulo="Leads importados"
          valor={leads.length}
          href="#fila"
          evidencia={evidenciaLeads(
            "Leads importados",
            "quantidade de registros de meta_leads do cliente (ordenados por createdTime desc, limite de 80)",
            resumoLeads(() => true),
          )}
        />
        <Metrica
          rotulo="Novos"
          valor={newLeads}
          tom={newLeads > 0 ? "atencao" : "neutro"}
          href="#fila"
          evidencia={evidenciaLeads(
            "Novos",
            "quantidade com processingStatus = NEW entre os últimos 80 leads",
            resumoLeads((lead) => lead.processingStatus === "NEW"),
          )}
        />
        <Metrica
          rotulo="Convertidos no CRM"
          valor={convertedLeads}
          tom="bom"
          href="#fila"
          evidencia={evidenciaLeads(
            "Convertidos no CRM",
            "quantidade com leadId preenchido entre os últimos 80 leads",
            resumoLeads((lead) => Boolean(lead.leadId)),
          )}
        />
      </GradeMetricas>

      <PainelMeta id="fontes" titulo="Fontes de captação" descricao="Lead Ads disponíveis por cliente.">
        {linhasFormularios.length === 0 ? (
          <EstadoVazio
            compacto
            titulo="Nenhum formulário importado."
            descricao="Os formulários vêm das páginas conectadas na sincronização da Meta."
            acao={{ label: "Sincronizar a Meta", href: hrefConexao }}
          />
        ) : (
          <TabelaResponsiva
            rotulo="Fontes de captação"
            colunas={[
              { chave: "formulario", rotulo: "Formulário", principal: true },
              { chave: "status", rotulo: "Status" },
              { chave: "pagina", rotulo: "Página" },
              { chave: "conta", rotulo: "Conta de anúncio" },
              { chave: "perguntas", rotulo: "Perguntas", alinhar: "direita" },
              { chave: "sync", rotulo: "Última sincronização" },
            ]}
            linhas={linhasFormularios}
          />
        )}
      </PainelMeta>

      <PainelMeta id="fila" titulo="Fila operacional" descricao="Últimos 80 registros importados.">
        {linhasFila.length === 0 ? (
          <EstadoVazio
            compacto
            titulo="Nenhum lead recebido ainda."
            descricao="Quando o webhook receber leads, eles entram aqui."
            acao={{ label: "Ver webhook", href: hrefConexao }}
          />
        ) : (
          <TabelaResponsiva
            rotulo="Fila operacional"
            colunas={[
              { chave: "formulario", rotulo: "Formulário", principal: true },
              { chave: "criado", rotulo: "Criado na Meta" },
              { chave: "status", rotulo: "Status" },
              { chave: "pagina", rotulo: "Página" },
              { chave: "campos", rotulo: "Campos", alinhar: "direita" },
              { chave: "crm", rotulo: "CRM" },
            ]}
            linhas={linhasFila}
          />
        )}
      </PainelMeta>
    </div>
  );
}
