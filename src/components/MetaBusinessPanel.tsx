"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import BadgeStatus from "@/components/hub-social/BadgeStatus";
import BotaoEvidencia from "@/components/hub-social/FolhaEvidencia";
import ListaChaveValor, { type ItemChaveValor } from "@/components/hub-social/ListaChaveValor";
import GradeMetricas, { Metrica } from "@/components/hub-social/Metricas";
import { Button } from "@/components/shadcn/button";
import { Card, CardContent } from "@/components/shadcn/card";
import type { Evidencia } from "@/lib/evidencia";
import type { MetaConnectionStatus } from "@/lib/meta";
import { cn } from "@/lib/utils";

/**
 * Aba "Conexão" da Meta: token OAuth do cliente selecionado, URLs contratuais
 * e contadores do que já foi importado para o Postgres. O seletor de cliente
 * vive na página (MetaClientSelect); aqui só o que depende do estado da
 * sincronização.
 */

const ORIGEM_STATUS = "getMetaConnectionStatus() em src/lib/meta.ts";
const ORIGEM_CONTADORES = "getMetaConnectionStatus().counts";

const DIA_MS = 24 * 60 * 60 * 1_000;
const LIMITE_EXPIRACAO_MS = 7 * DIA_MS;

const formatoDataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const formatoData = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

function formatar(iso: string | null | undefined, formato: Intl.DateTimeFormat): string | null {
  if (!iso) return null;
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? null : formato.format(data);
}

type Aviso = { tom: "ruim" | "bom" | "atencao"; children: React.ReactNode };

const bordaPorTom: Record<Aviso["tom"], string> = {
  ruim: "border-[color:var(--red-line)]",
  bom: "border-[color:var(--green-line)]",
  atencao: "border-[color:var(--amber-line)]",
};

function CartaoAviso({ tom, children }: Aviso) {
  return (
    <Card role="status" className={cn("gap-0 py-4 shadow-none", bordaPorTom[tom])}>
      <CardContent className="px-4 text-[15px] leading-[1.5] text-foreground min-[821px]:text-sm">
        {children}
      </CardContent>
    </Card>
  );
}

export default function MetaBusinessPanel({
  initialStatus,
  selectedOrganizationId,
  callbackUrl,
  webhookUrl,
  error,
  connected,
  lidoEm,
}: {
  initialStatus: MetaConnectionStatus;
  selectedOrganizationId: string;
  callbackUrl: string;
  webhookUrl: string;
  error?: string;
  connected?: boolean;
  lidoEm: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [message, setMessage] = useState(
    connected ? "Meta Business conectado e sincronizado." : "",
  );
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(error ?? "");

  async function syncNow() {
    setSyncing(true);
    setSyncError("");
    setMessage("");

    try {
      const response = await fetch("/api/integrations/meta/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: selectedOrganizationId }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Falha ao sincronizar Meta.");
      }

      setStatus((current) => ({
        ...current,
        connected: true,
        connection: {
          ...(current.connection ?? {
            id: data.connection.id,
            status: data.connection.status,
            lastSyncedAt: null,
            lastSyncStatus: null,
            lastSyncError: null,
          }),
          status: data.connection.status,
          lastSyncedAt: data.connection.lastSyncedAt,
          lastSyncStatus: data.connection.lastSyncStatus,
          lastSyncError: data.connection.lastSyncError,
        },
        counts: {
          ...current.counts,
          businesses: current.counts.businesses + (data.imported?.businesses ?? 0),
          pages: current.counts.pages + (data.imported?.pages ?? 0),
          adAccounts: current.counts.adAccounts + (data.imported?.adAccounts ?? 0),
        },
      }));
      setMessage(
        `Sincronização enviada: ${data.imported?.businesses ?? 0} negócios, ${
          data.imported?.pages ?? 0
        } páginas e ${data.imported?.adAccounts ?? 0} contas de anúncio consultadas.`,
      );
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Falha ao sincronizar Meta.");
    } finally {
      setSyncing(false);
    }
  }

  const conexao = status.connection;
  const organizationQuery = `organizationId=${encodeURIComponent(selectedOrganizationId)}`;
  const oauthHref = `/api/integrations/meta/oauth/start?${organizationQuery}`;
  const hrefAtivos = `/hub-social/meta/ativos?${organizationQuery}`;
  const hrefLeads = `/hub-social/meta/leads?${organizationQuery}`;

  // Expiração do token: avisa a partir de 7 dias antes; expirado ganha badge própria.
  // Mede contra o instante da leitura no servidor, não contra o relógio do render.
  const expiraEm = conexao?.tokenExpiresAt ? new Date(conexao.tokenExpiresAt).getTime() : null;
  const restante = expiraEm !== null && !Number.isNaN(expiraEm) ? expiraEm - new Date(lidoEm).getTime() : null;
  const badgeExpiracao =
    restante === null ? null : restante <= 0 ? (
      <BadgeStatus status="expired" />
    ) : restante <= LIMITE_EXPIRACAO_MS ? (
      <BadgeStatus status="expiring" tom="atencao" texto="expira em breve" />
    ) : null;

  const itensConexao: ItemChaveValor[] = [
    { rotulo: "Usuário conectado", valor: conexao?.userName, vazio: "Não conectado" },
    {
      rotulo: "Última sincronização",
      valor: formatar(conexao?.lastSyncedAt, formatoDataHora),
      vazio: "Nunca sincronizado",
    },
    {
      rotulo: "Status técnico",
      valor: conexao?.lastSyncStatus ? <BadgeStatus status={conexao.lastSyncStatus} /> : null,
      vazio: "—",
    },
    {
      rotulo: "Expiração do token",
      valor: conexao?.tokenExpiresAt ? (
        <>
          <span>{formatar(conexao.tokenExpiresAt, formatoData)}</span>
          {badgeExpiracao}
        </>
      ) : null,
      vazio: "—",
    },
  ];
  if (conexao?.lastSyncError) {
    itensConexao.push({ rotulo: "Erro da última sincronização", valor: conexao.lastSyncError });
  }

  const evidenciaConexao: Evidencia = {
    rotulo: "Conexão Meta",
    origem: ORIGEM_STATUS,
    funcao:
      'prisma.organizationIntegrationConnection.findUnique({ where: { organizationId_provider: { organizationId, provider: "meta_business" } } })',
    formula:
      "uma linha de organization_integration_connections por cliente e provedor; conectado quando status ≠ DISCONNECTED. Usuário = account_name, expiração = token_expires_at",
    lidoEm,
    gravadoEm: conexao?.lastSyncedAt ?? null,
    referencia: conexao?.id ?? null,
    observacao: conexao ? "Gravado em = last_synced_at da conexão." : "Nenhuma conexão gravada para este cliente.",
    bruto: status.connection,
  };

  const evidenciaContador = (rotulo: string, tabela: string, funcao: string, observacao?: string): Evidencia => ({
    rotulo,
    origem: ORIGEM_CONTADORES,
    funcao,
    formula: `count na tabela ${tabela} filtrando organizationId`,
    lidoEm,
    observacao,
    bruto: status.counts,
  });

  const evidenciaWebhooks: Evidencia = {
    rotulo: "Eventos de webhook",
    origem: ORIGEM_CONTADORES,
    funcao: 'prisma.integrationWebhookEvent.count({ where: { provider: "meta_business" } })',
    formula: "count na tabela integration_webhook_events filtrando provider = meta_business (todos os clientes)",
    lidoEm,
    observacao: "Este contador não é filtrado por organizationId: a tabela não guarda o cliente do evento.",
    bruto: status.counts,
  };

  return (
    <div className="space-y-6">
      {syncError ? (
        <CartaoAviso tom="ruim">
          <strong className="font-semibold">Não foi possível concluir.</strong> {syncError}
        </CartaoAviso>
      ) : null}

      {message ? <CartaoAviso tom="bom">{message}</CartaoAviso> : null}

      {!status.configured ? (
        <CartaoAviso tom="atencao">
          <strong className="font-semibold">Variáveis de ambiente pendentes.</strong> Configure{" "}
          <code className="font-mono text-[13px]">META_APP_ID</code>,{" "}
          <code className="font-mono text-[13px]">META_APP_SECRET</code> e{" "}
          <code className="font-mono text-[13px]">META_TOKEN_ENCRYPTION_KEY</code> antes de abrir o OAuth.
        </CartaoAviso>
      ) : null}

      <div className="grid gap-4 min-[821px]:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div>
            <div className="-mb-1 flex justify-end">
              <BotaoEvidencia evidencia={evidenciaConexao} rotulo="Evidência da conexão Meta">
                <span className="inline-flex items-center gap-1.5 px-2 text-[13px] text-muted-foreground hover:text-foreground">
                  <Info size={14} aria-hidden="true" />
                  Como foi medido
                </span>
              </BotaoEvidencia>
            </div>
            <ListaChaveValor
              titulo="Conexão"
              descricao="Token OAuth do cliente selecionado. Não há token de sistema fora do app."
              itens={itensConexao}
            />
          </div>

          <div className="flex flex-col gap-2 min-[560px]:flex-row">
            {status.configured ? (
              <Button asChild className="min-h-[50px] w-full text-[15px] min-[560px]:w-auto min-[821px]:min-h-10 min-[821px]:text-sm">
                <a href={oauthHref}>{status.connected ? "Reconectar Meta" : "Conectar Meta"}</a>
              </Button>
            ) : (
              <Button asChild className="min-h-[50px] w-full text-[15px] min-[560px]:w-auto min-[821px]:min-h-10 min-[821px]:text-sm">
                <a
                  aria-disabled="true"
                  tabIndex={-1}
                  className="pointer-events-none opacity-50"
                  title="Configure as variáveis de ambiente antes de conectar."
                >
                  {status.connected ? "Reconectar Meta" : "Conectar Meta"}
                </a>
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={syncNow}
              disabled={!status.connected || syncing}
              className="min-h-[50px] w-full text-[15px] min-[560px]:w-auto min-[821px]:min-h-10 min-[821px]:text-sm"
            >
              {syncing ? "Sincronizando…" : "Sincronizar agora"}
            </Button>
          </div>
        </div>

        <ListaChaveValor
          titulo="URLs oficiais"
          descricao="Cole no painel da Meta. Estas URLs são contratuais e não mudam."
          itens={[
            { rotulo: "OAuth Redirect URI", valor: callbackUrl, mono: true, copiar: callbackUrl },
            { rotulo: "Webhook Callback URL", valor: webhookUrl, mono: true, copiar: webhookUrl },
            { rotulo: "Verify Token", valor: "META_WEBHOOK_VERIFY_TOKEN", mono: true },
          ]}
        />
      </div>

      <section aria-labelledby="meta-objetos-titulo" className="space-y-3">
        <div>
          <h2 id="meta-objetos-titulo" className="text-[15px] font-semibold text-foreground">
            Objetos da Meta no Postgres
          </h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Contadores reais das tabelas importadas para este cliente.
          </p>
        </div>
        <GradeMetricas rotulo="Objetos da Meta no Postgres">
          <Metrica
            rotulo="Business Managers"
            valor={status.counts.businesses}
            href={hrefAtivos}
            evidencia={evidenciaContador(
              "Business Managers",
              "meta_business_accounts",
              "prisma.metaBusinessAccount.count({ where: { organizationId } })",
            )}
          />
          <Metrica
            rotulo="Páginas"
            valor={status.counts.pages}
            href={hrefAtivos}
            evidencia={evidenciaContador("Páginas", "meta_pages", "prisma.metaPage.count({ where: { organizationId } })")}
          />
          <Metrica
            rotulo="Instagram"
            valor={status.counts.instagramAccounts}
            href={hrefAtivos}
            evidencia={evidenciaContador(
              "Instagram",
              "instagram_accounts",
              "prisma.instagramAccount.count({ where: { organizationId } })",
            )}
          />
          <Metrica
            rotulo="Contas de anúncio"
            valor={status.counts.adAccounts}
            href={hrefAtivos}
            evidencia={evidenciaContador(
              "Contas de anúncio",
              "meta_ad_accounts",
              "prisma.metaAdAccount.count({ where: { organizationId } })",
            )}
          />
          <Metrica
            rotulo="Formulários de lead"
            valor={status.counts.leadForms}
            href={hrefLeads}
            evidencia={evidenciaContador(
              "Formulários de lead",
              "meta_lead_forms",
              "prisma.metaLeadForm.count({ where: { organizationId } })",
            )}
          />
          <Metrica rotulo="Eventos de webhook" valor={status.counts.webhookEvents} evidencia={evidenciaWebhooks} />
        </GradeMetricas>
      </section>
    </div>
  );
}
