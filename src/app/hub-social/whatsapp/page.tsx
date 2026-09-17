import { redirect } from "next/navigation";
import BadgeStatus from "@/components/hub-social/BadgeStatus";
import CabecalhoPagina from "@/components/hub-social/CabecalhoPagina";
import ListaChaveValor from "@/components/hub-social/ListaChaveValor";
import GradeMetricas, { Metrica } from "@/components/hub-social/Metricas";
import EventosRecentes, { type EventoWhatsapp } from "@/components/whatsapp/EventosRecentes";
import { getAdmin } from "@/lib/auth";
import type { Evidencia } from "@/lib/evidencia";
import { prisma } from "@/lib/prisma";
import { getWhatsappStatus, WHATSAPP_PROVIDER } from "@/lib/whatsapp";

const ORIGEM_STATUS = "getWhatsappStatus() em src/lib/whatsapp.ts";

const formatoDataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export default async function WhatsappOperationsPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const lidoEm = new Date().toISOString();
  const [status, eventosBrutos] = await Promise.all([
    getWhatsappStatus(),
    prisma.integrationWebhookEvent.findMany({
      where: { provider: WHATSAPP_PROVIDER },
      orderBy: { receivedAt: "desc" },
      take: 20,
      select: {
        id: true,
        eventType: true,
        status: true,
        receivedAt: true,
        processedAt: true,
        idempotencyKey: true,
        externalId: true,
        error: true,
        payload: true,
      },
    }),
  ]);

  const eventos: EventoWhatsapp[] = eventosBrutos.map((evento) => ({
    ...evento,
    receivedAt: evento.receivedAt.toISOString(),
    processedAt: evento.processedAt?.toISOString() ?? null,
  }));

  const appUrl = (process.env.APP_URL || "https://app.avilaops.com").replace(/\/$/, "");
  const webhookUrl = `${appUrl}/api/webhooks/whatsapp`;
  const flowUrl = `${appUrl}/api/webhooks/whatsapp/flow`;
  const legacyWebhookUrl = `${appUrl}/webhook`;
  const legacyFlowUrl = `${appUrl}/flow-endpoint`;

  const ultimoEvento = status.latestEvent;

  const evidenciaConfiguracao: Evidencia = {
    rotulo: "Configuração",
    origem: ORIGEM_STATUS,
    funcao: "isWhatsappConfigured() em src/lib/whatsapp.ts",
    formula:
      "Ativa quando WHATSAPP_VERIFY_TOKEN, WHATSAPP_API_TOKEN e WHATSAPP_PHONE_NUMBER_ID estão definidas no ambiente",
    lidoEm,
    observacao: "Lido das variáveis de ambiente; não há gravação em banco.",
    bruto: { configured: status.configured },
  };

  const evidenciaFlow: Evidencia = {
    rotulo: "Flow endpoint",
    origem: ORIGEM_STATUS,
    funcao: "configuredPrivateKey() em src/lib/whatsapp.ts",
    formula: "Ativo quando WHATSAPP_FLOW_PRIVATE_KEY_BASE64 ou WHATSAPP_FLOW_PRIVATE_KEY está definida no ambiente",
    lidoEm,
    observacao: "Lido das variáveis de ambiente; não há gravação em banco.",
    bruto: { flowConfigured: status.flowConfigured },
  };

  const evidenciaEventos: Evidencia = {
    rotulo: "Eventos",
    origem: ORIGEM_STATUS,
    funcao: 'prisma.integrationWebhookEvent.count({ where: { provider: "whatsapp_business" } })',
    formula: "contagem de linhas de integration_webhook_events com provider = whatsapp_business",
    lidoEm,
    gravadoEm: ultimoEvento?.receivedAt ?? null,
    observacao: ultimoEvento ? "Gravado em = receivedAt do evento mais recente." : undefined,
    bruto: { events: status.events, latestEvent: ultimoEvento },
  };

  const evidenciaFlows: Evidencia = {
    rotulo: "Flows",
    origem: ORIGEM_STATUS,
    funcao: 'prisma.integrationWebhookEvent.count({ where: { provider: "whatsapp_business", eventType: "flow" } })',
    formula: "contagem de linhas de integration_webhook_events com provider = whatsapp_business e eventType = flow",
    lidoEm,
    bruto: { flowEvents: status.flowEvents },
  };

  const tomConfigurado = (valor: string) => (valor === "configurado" ? "bom" : "atencao");

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="WhatsApp Business"
        subtitulo="Webhooks, Flows, catálogo e eventos da conta."
        meta={status.configured ? "Pronto para validação" : "Variáveis pendentes"}
      />

      <GradeMetricas rotulo="Estado da conta">
        <Metrica
          rotulo="Configuração"
          valor={status.configured ? "Ativa" : "Pendente"}
          tom={status.configured ? "bom" : "atencao"}
          evidencia={evidenciaConfiguracao}
        />
        <Metrica
          rotulo="Flow endpoint"
          valor={status.flowConfigured ? "Ativo" : "Pendente"}
          tom={status.flowConfigured ? "bom" : "atencao"}
          evidencia={evidenciaFlow}
        />
        <Metrica rotulo="Eventos" valor={status.events} href="#eventos" evidencia={evidenciaEventos} />
        <Metrica rotulo="Flows" valor={status.flowEvents} href="#eventos" evidencia={evidenciaFlows} />
      </GradeMetricas>

      <div className="grid gap-4 min-[821px]:grid-cols-2">
        <div id="urls" className="scroll-mt-4">
          <ListaChaveValor
            titulo="URLs oficiais"
            descricao="Cole no painel da Meta. Estas URLs são contratuais e não mudam."
            itens={[
              { rotulo: "Webhook Callback URL", valor: webhookUrl, mono: true, copiar: webhookUrl },
              { rotulo: "Verify Token", valor: "WHATSAPP_VERIFY_TOKEN", mono: true },
              { rotulo: "Flow endpoint", valor: flowUrl, mono: true, copiar: flowUrl },
              {
                rotulo: "Compatibilidade webhook antigo",
                valor: legacyWebhookUrl,
                mono: true,
                copiar: legacyWebhookUrl,
              },
              { rotulo: "Compatibilidade Flow antigo", valor: legacyFlowUrl, mono: true, copiar: legacyFlowUrl },
            ]}
          />
        </div>

        <ListaChaveValor
          titulo="Conexão WhatsApp"
          itens={[
            {
              rotulo: "Phone Number ID",
              valor: <BadgeStatus status={status.phoneNumberId} tom={tomConfigurado(status.phoneNumberId)} />,
            },
            {
              rotulo: "Catalog ID",
              valor: <BadgeStatus status={status.catalogId} tom={tomConfigurado(status.catalogId)} />,
            },
            { rotulo: "Conexões por cliente", valor: String(status.connections), href: "/clientes" },
            {
              rotulo: "Último evento",
              valor: ultimoEvento ? (
                <>
                  <span className="font-medium">{ultimoEvento.eventType}</span>
                  <span className="ml-2 text-[13px] text-muted-foreground">
                    {formatoDataHora.format(new Date(ultimoEvento.receivedAt))}
                  </span>
                </>
              ) : null,
              status: ultimoEvento?.status,
              vazio: "Nenhum evento recebido",
            },
          ]}
        />
      </div>

      <section id="eventos" aria-label="Eventos recentes" className="scroll-mt-4">
        <EventosRecentes eventos={eventos} lidoEm={lidoEm} />
      </section>
    </div>
  );
}
