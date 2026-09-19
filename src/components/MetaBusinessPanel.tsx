"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import BadgeStatus from "@/components/sistema/Status";
import BotaoEvidencia from "@/components/hub-social/FolhaEvidencia";
import ListaChaveValor, { type ItemChaveValor } from "@/components/hub-social/ListaChaveValor";
import GradeMetricas, { Metrica } from "@/components/hub-social/Metricas";
import { Button } from "@/components/shadcn/button";
import { Card, CardContent } from "@/components/shadcn/card";
import type { Evidencia } from "@/lib/evidencia";
import type { EstadoDoInstagram } from "@/lib/instagram";
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
const ORIGEM_INSTAGRAM = "estadoDoInstagram() em src/lib/instagram.ts";

const DIA_MS = 24 * 60 * 60 * 1_000;
const LIMITE_EXPIRACAO_MS = 7 * DIA_MS;
// A rotina diária renova a partir daqui (JANELA_RENOVACAO_DIAS em
// src/lib/instagram-renovacao.ts). A tela usa o mesmo número para não dizer
// "expira em breve" sobre um token que a rotina já vai renovar hoje à noite.
const JANELA_RENOVACAO_MS = 10 * DIA_MS;

// `timeZone` fixo, como em src/lib/format.ts e no resto da casa: o servidor roda
// em UTC e o navegador do Brasil não, então sem isto o mesmo instante vira dois
// textos diferentes e o React derruba a hidratação da página inteira (erro 418)
// — a tela ainda aparece, porque o React remonta no cliente, mas o console
// enche de erro e nada acima deste ponto mantém estado.
const FUSO = "America/Sao_Paulo";
const formatoDataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: FUSO,
});
const formatoData = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: FUSO });

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
  instagram,
}: {
  initialStatus: MetaConnectionStatus;
  selectedOrganizationId: string;
  callbackUrl: string;
  webhookUrl: string;
  error?: string;
  connected?: boolean;
  lidoEm: string;
  instagram: EstadoDoInstagram | null;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [message, setMessage] = useState(
    connected ? "Meta Business conectado e sincronizado." : "",
  );
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(error ?? "");
  const [instagramEstado, setInstagramEstado] = useState(instagram);
  const [renovando, setRenovando] = useState(false);
  const [sincronizandoIg, setSincronizandoIg] = useState(false);

  /**
   * Renovação sob demanda do token do Instagram. A rotina diária faz o mesmo
   * sozinha; este botão existe para o caso em que alguém está olhando a tela
   * agora e não quer esperar a madrugada.
   */
  async function renovarInstagram() {
    setRenovando(true);
    setSyncError("");
    setMessage("");

    try {
      const resposta = await fetch("/api/integrations/instagram/renovar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: selectedOrganizationId }),
      });
      const dados = await resposta.json();
      if (!resposta.ok || !dados.ok) {
        throw new Error(dados.error ?? "Falha ao renovar o token do Instagram.");
      }

      const desta = dados.conexoes?.[0];
      if (!desta) {
        setMessage("Nenhuma conexão de Instagram para este cliente.");
      } else if (desta.desfecho === "RENOVADO") {
        setInstagramEstado((atual) =>
          atual
            ? { ...atual, conexao: { ...atual.conexao, tokenExpiresAt: desta.expiraEm } }
            : atual,
        );
        setMessage("Token do Instagram renovado por mais 60 dias.");
      } else if (desta.desfecho === "VENCIDO") {
        throw new Error(
          "Token vencido: a Meta não renova token vencido. O cliente precisa autorizar de novo em Conectar Instagram.",
        );
      } else if (desta.desfecho === "FALHOU") {
        throw new Error(desta.erro ?? "Falha ao renovar o token do Instagram.");
      } else {
        setMessage("Token ainda em dia — nada a renovar.");
      }
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Falha ao renovar o token do Instagram.");
    } finally {
      setRenovando(false);
    }
  }

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

  /**
   * Relê o perfil no Instagram. Separado do "Sincronizar agora" da Meta porque
   * são duas APIs e dois tokens: juntar os dois num botão só faria a falha de
   * um aparecer como falha do outro.
   */
  async function sincronizarInstagram() {
    setSincronizandoIg(true);
    setSyncError("");
    setMessage("");

    try {
      const resposta = await fetch("/api/integrations/instagram/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: selectedOrganizationId }),
      });
      const dados = await resposta.json();
      if (!resposta.ok || !dados.ok) {
        throw new Error(dados.error ?? "Falha ao sincronizar o Instagram.");
      }

      setInstagramEstado((atual) =>
        atual
          ? {
              conexao: {
                ...atual.conexao,
                conta: dados.conta,
                lastSyncedAt: dados.lidoEm,
                lastSyncStatus: "SYNCED",
                lastSyncError: null,
              },
              contas: atual.contas.some((c) => c.username === dados.conta)
                ? atual.contas.map((c) =>
                    c.username === dados.conta
                      ? {
                          ...c,
                          followersCount: dados.seguidores,
                          mediaCount: dados.publicacoes,
                          lidoEm: dados.lidoEm,
                        }
                      : c,
                  )
                : [
                    ...atual.contas,
                    {
                      username: dados.conta,
                      name: null,
                      accountType: null,
                      followersCount: dados.seguidores,
                      mediaCount: dados.publicacoes,
                      profilePictureUrl: null,
                      lidoEm: dados.lidoEm,
                    },
                  ],
            }
          : atual,
      );
      setMessage(`Instagram relido: @${dados.conta}.`);
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Falha ao sincronizar o Instagram.");
    } finally {
      setSincronizandoIg(false);
    }
  }

  const conexao = status.connection;
  const organizationQuery = `organizationId=${encodeURIComponent(selectedOrganizationId)}`;
  const oauthHref = `/api/integrations/meta/oauth/start?${organizationQuery}`;
  const instagramHref = `/api/integrations/instagram/oauth/start?${organizationQuery}`;
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

  // --- Instagram pelo login próprio -----------------------------------------
  const conexaoIg = instagramEstado?.conexao ?? null;
  const expiraIg = conexaoIg?.tokenExpiresAt ? new Date(conexaoIg.tokenExpiresAt).getTime() : null;
  const restanteIg =
    expiraIg !== null && !Number.isNaN(expiraIg) ? expiraIg - new Date(lidoEm).getTime() : null;
  const diasIg = restanteIg === null ? null : Math.floor(restanteIg / DIA_MS);

  /**
   * Três estados, e não dois: vencido só reconecta, dentro da janela a rotina
   * diária resolve sozinha, e fora dela não há o que dizer. Chamar de "expira
   * em breve" o que a rotina já vai renovar hoje faria a tela pedir socorro
   * sem motivo.
   */
  const badgeIg =
    restanteIg === null ? null : restanteIg <= 0 ? (
      <BadgeStatus status="expired" />
    ) : restanteIg <= JANELA_RENOVACAO_MS ? (
      <BadgeStatus status="renewing" tom="atencao" texto="renovação automática" />
    ) : null;

  const itensInstagram: ItemChaveValor[] = conexaoIg
    ? [
        { rotulo: "Conta conectada", valor: conexaoIg.conta ? `@${conexaoIg.conta}` : null, vazio: "—" },
        {
          rotulo: "Validade do token",
          valor: conexaoIg.tokenExpiresAt ? (
            <>
              <span>{formatar(conexaoIg.tokenExpiresAt, formatoData)}</span>
              {diasIg !== null && diasIg > 0 ? (
                <span className="text-muted-foreground"> · faltam {diasIg} d</span>
              ) : null}
              {badgeIg}
            </>
          ) : null,
          vazio: "Sem validade gravada",
        },
        {
          rotulo: "Última renovação",
          valor: formatar(conexaoIg.lastSyncedAt, formatoDataHora),
          vazio: "Nunca renovado",
        },
        {
          rotulo: "Status técnico",
          valor: conexaoIg.lastSyncStatus ? <BadgeStatus status={conexaoIg.lastSyncStatus} /> : null,
          vazio: "—",
        },
      ]
    : [];
  if (conexaoIg?.lastSyncError) {
    itensInstagram.push({ rotulo: "Erro da última tentativa", valor: conexaoIg.lastSyncError });
  }

  /**
   * Seguidor e publicação são lidos no consentimento e no "Sincronizar
   * Instagram" — não há leitura contínua. Por isso a data de leitura vem junto
   * do número, e não escondida na folha: número de dois meses atrás com cara de
   * agora é pior do que número nenhum.
   */
  const contasIg = instagramEstado?.contas ?? [];
  const itensContasIg: ItemChaveValor[] = contasIg.flatMap((conta) => {
    const lido = formatar(conta.lidoEm, formatoDataHora);
    return [
      {
        rotulo: `@${conta.username}`,
        valor: conta.name || conta.accountType || null,
        vazio: "—",
      },
      {
        rotulo: "Seguidores",
        valor:
          conta.followersCount === null || conta.followersCount === undefined ? null : (
            <>
              <span>{conta.followersCount.toLocaleString("pt-BR")}</span>
              {lido ? <span className="text-muted-foreground"> · lido em {lido}</span> : null}
            </>
          ),
        vazio: "Não informado pelo Instagram",
      },
      {
        rotulo: "Publicações",
        valor:
          conta.mediaCount === null || conta.mediaCount === undefined ? null : (
            <>
              <span>{conta.mediaCount.toLocaleString("pt-BR")}</span>
              {lido ? <span className="text-muted-foreground"> · lido em {lido}</span> : null}
            </>
          ),
        vazio: "Não informado pelo Instagram",
      },
    ];
  });

  const evidenciaContasIg: Evidencia = {
    rotulo: "Conta do Instagram",
    origem: ORIGEM_INSTAGRAM,
    funcao:
      'prisma.instagramAccount.findMany({ where: { organizationId, origem: "instagram_login" } })',
    formula:
      "gravado da resposta de graph.instagram.com/me (fields: username, followers_count, media_count) no consentimento e a cada Sincronizar Instagram. Não há leitura contínua: o valor é o da última leitura",
    lidoEm,
    gravadoEm: contasIg[0]?.lidoEm ?? null,
    referencia: conexaoIg?.contaId ?? null,
    observacao:
      "Gravado em = last_synced_at da conta. Cada sincronização grava INSTAGRAM_ACCOUNT_SYNCED na auditoria.",
    bruto: contasIg,
  };

  const evidenciaInstagram: Evidencia = {
    rotulo: "Conexão Instagram (login próprio)",
    origem: ORIGEM_INSTAGRAM,
    funcao:
      'prisma.organizationIntegrationConnection.findUnique({ where: { organizationId_provider: { organizationId, provider: "instagram_login" } } })',
    formula:
      "token_expires_at da conexão menos o instante da leitura. A rotina diária (POST /api/integrations/instagram/renovar) renova quando faltam 10 dias ou menos; vencido não renova e exige nova autorização do cliente",
    lidoEm,
    gravadoEm: conexaoIg?.lastSyncedAt ?? null,
    referencia: conexaoIg?.id ?? null,
    observacao:
      "Gravado em = last_synced_at, que a renovação atualiza. Cada renovação, vencimento e falha gera evento de auditoria (INSTAGRAM_TOKEN_RENEWED, INSTAGRAM_TOKEN_EXPIRED, INSTAGRAM_TOKEN_RENEWAL_FAILED).",
    bruto: instagramEstado,
  };

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
            {/*
              Caminho separado, e não um "conectar" só: pelo Facebook a conta do
              Instagram só aparece se estiver vinculada a uma Página. Cliente com
              Instagram e sem Página precisa deste botão, e é o único jeito de
              ele entrar na plataforma.
            */}
            <Button
              asChild
              variant="outline"
              className="min-h-[50px] w-full text-[15px] min-[560px]:w-auto min-[821px]:min-h-10 min-[821px]:text-sm"
            >
              <a href={instagramHref}>
                {conexaoIg ? "Reconectar Instagram" : "Conectar Instagram"}
              </a>
            </Button>
          </div>
          <p className="text-xs text-[var(--color-texto-fraco)]">
            Use o Instagram quando o cliente não tiver Página no Facebook. Com Página,
            a conta já vem junto pelo Conectar Meta.
          </p>

          {conexaoIg ? (
            <div>
              <div className="-mb-1 flex justify-end">
                <BotaoEvidencia
                  evidencia={evidenciaInstagram}
                  rotulo="Evidência da conexão Instagram"
                >
                  <span className="inline-flex items-center gap-1.5 px-2 text-[13px] text-muted-foreground hover:text-foreground">
                    <Info size={14} aria-hidden="true" />
                    Como foi medido
                  </span>
                </BotaoEvidencia>
              </div>
              <ListaChaveValor
                titulo="Instagram (login próprio)"
                descricao="O token vale 60 dias e é renovado sozinho a partir de 10 dias para vencer. Vencido, a Meta não renova: o cliente autoriza de novo."
                itens={itensInstagram}
              />
              {itensContasIg.length ? (
                <div className="mt-4">
                  <div className="-mb-1 flex justify-end">
                    <BotaoEvidencia
                      evidencia={evidenciaContasIg}
                      rotulo="Evidência da conta do Instagram"
                    >
                      <span className="inline-flex items-center gap-1.5 px-2 text-[13px] text-muted-foreground hover:text-foreground">
                        <Info size={14} aria-hidden="true" />
                        Como foi medido
                      </span>
                    </BotaoEvidencia>
                  </div>
                  <ListaChaveValor
                    titulo="Conta conectada"
                    descricao="Lido do Instagram no consentimento e a cada sincronização — não há leitura contínua."
                    itens={itensContasIg}
                  />
                </div>
              ) : null}

              <div className="mt-3 flex flex-col gap-2 min-[560px]:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  onClick={sincronizarInstagram}
                  disabled={sincronizandoIg}
                  className="min-h-[50px] w-full text-[15px] min-[560px]:w-auto min-[821px]:min-h-10 min-[821px]:text-sm"
                >
                  {sincronizandoIg ? "Lendo…" : "Sincronizar Instagram"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={renovarInstagram}
                  disabled={renovando}
                  className="min-h-[50px] w-full text-[15px] min-[560px]:w-auto min-[821px]:min-h-10 min-[821px]:text-sm"
                >
                  {renovando ? "Renovando…" : "Renovar token agora"}
                </Button>
              </div>
            </div>
          ) : null}
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
