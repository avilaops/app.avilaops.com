"use client";

import { useState } from "react";
import BadgeStatus from "@/components/sistema/Status";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import ListaChaveValor from "@/components/hub-social/ListaChaveValor";
import { Button } from "@/components/shadcn/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shadcn/card";
import {
  ACOES,
  BOTAO,
  CartaoLista,
  formatarDataHora,
  MensagemErro,
  rotuloIntegracao,
  type Conexao,
} from "@/components/hub-social/comum";

type SitemapEntry = {
  path?: string | null;
  lastSubmitted?: string | null;
  isPending?: boolean | null;
  errors?: string | null;
};

type Connection = Conexao;

export default function SearchConsolePanel({
  siteUrl,
  sitemapUrl,
  initialConnection,
  initialSitemaps,
  initialError,
}: {
  siteUrl: string;
  sitemapUrl: string;
  initialConnection: Connection;
  initialSitemaps: SitemapEntry[];
  initialError?: string;
}) {
  const [connection, setConnection] = useState(initialConnection);
  const [sitemaps, setSitemaps] = useState(initialSitemaps);
  const [error, setError] = useState(initialError ?? "");
  const [status, setStatus] = useState<
    "idle" | "adding" | "verifying" | "auditing" | "sending" | "done"
  >("idle");

  async function refreshSearchConsole() {
    const refreshed = await fetch(
      `/api/integrations/search-console?siteUrl=${encodeURIComponent(siteUrl)}`,
    );
    const refreshedData = await refreshed.json();
    setConnection(refreshedData.connection ?? null);
    setSitemaps(refreshedData.sitemaps ?? []);
    if (refreshedData.error) setError(refreshedData.error);
  }

  async function handleAddSite() {
    setStatus("adding");
    setError("");

    try {
      const response = await fetch("/api/integrations/search-console/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setConnection(data.connection ?? null);
        setError(data.error ?? "Falha ao cadastrar a propriedade.");
      } else {
        setConnection(data.connection);
        await refreshSearchConsole();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao cadastrar a propriedade.");
    } finally {
      setStatus("done");
      window.setTimeout(() => setStatus("idle"), 2500);
    }
  }

  async function handleVerifyDomain() {
    setStatus("verifying");
    setError("");

    try {
      const response = await fetch("/api/integrations/search-console/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl }),
      });
      const data = await response.json();
      setConnection(data.connection ?? null);

      if (!response.ok || !data.ok) {
        setError(
          data.error ??
            "TXT criado, mas o Google ainda não confirmou a verificação.",
        );
      } else {
        await refreshSearchConsole();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao verificar o domínio.");
    } finally {
      setStatus("done");
      window.setTimeout(() => setStatus("idle"), 2500);
    }
  }

  async function handleAuditSitemap() {
    setStatus("auditing");
    setError("");

    try {
      const response = await fetch("/api/integrations/search-console/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl }),
      });
      const data = await response.json();
      setConnection(data.connection ?? null);

      if (!response.ok || !data.ok) {
        setError(data.audit?.error ?? data.error ?? "Sitemap público inválido.");
      } else {
        await refreshSearchConsole();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao auditar sitemap.");
    } finally {
      setStatus("done");
      window.setTimeout(() => setStatus("idle"), 2500);
    }
  }

  async function handleSubmit() {
    setStatus("sending");
    setError("");

    try {
      const response = await fetch("/api/integrations/search-console/sitemap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl, sitemapUrl }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setConnection(data.connection ?? null);
        setError(data.error ?? "Falha ao enviar o sitemap.");
      } else {
        setConnection(data.connection);
        await refreshSearchConsole();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao enviar o sitemap.");
    } finally {
      setStatus("done");
      window.setTimeout(() => setStatus("idle"), 2500);
    }
  }

  const ocupado = status !== "idle";

  return (
    <Card className="gap-5 shadow-none">
      <CardHeader className="px-4 min-[821px]:px-6">
        <CardTitle className="text-[17px] min-[821px]:text-[15px]">Google Search Console</CardTitle>
        <CardDescription className="break-all font-mono text-[13px]">{siteUrl}</CardDescription>
        <CardAction>
          <BadgeStatus {...rotuloIntegracao(connection?.lastSyncStatus, "Nunca sincronizado")} />
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-5 px-4 min-[821px]:px-6">
        <div className={ACOES}>
          <Button type="button" onClick={handleSubmit} disabled={ocupado} className={BOTAO}>
            {status === "sending" ? "Enviando..." : "Enviar sitemap agora"}
          </Button>
          <Button type="button" variant="outline" onClick={handleAddSite} disabled={ocupado} className={BOTAO}>
            {status === "adding" ? "Cadastrando..." : "Cadastrar propriedade"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleVerifyDomain}
            disabled={ocupado || !siteUrl.startsWith("sc-domain:")}
            className={BOTAO}
          >
            {status === "verifying" ? "Verificando..." : "Criar TXT e verificar"}
          </Button>
          <Button type="button" variant="outline" onClick={handleAuditSitemap} disabled={ocupado} className={BOTAO}>
            {status === "auditing" ? "Auditando..." : "Auditar sitemap"}
          </Button>
        </div>

        {error ? (
          <div className="space-y-1">
            <MensagemErro>
              <strong className="font-semibold">Não foi possível consultar/enviar.</strong> {error}
            </MensagemErro>
            <p className="text-[13px] leading-5 text-muted-foreground">
              Confirme se a service account tem acesso à propriedade no Search Console e se{" "}
              <code className="font-mono text-[12px]">GOOGLE_SERVICE_ACCOUNT_JSON</code> está configurado.
            </p>
          </div>
        ) : null}

        <ListaChaveValor
          titulo="Propriedade"
          itens={[
            {
              rotulo: "Última sincronização",
              valor: formatarDataHora(connection?.lastSyncedAt),
              vazio: "Nunca sincronizado",
            },
            {
              rotulo: "Status",
              valor: connection?.lastSyncStatus ? <BadgeStatus {...rotuloIntegracao(connection.lastSyncStatus)} /> : null,
            },
            {
              rotulo: "Propriedade",
              valor: connection?.status ? <BadgeStatus {...rotuloIntegracao(connection.status)} /> : null,
              vazio: "Não registrada no Ávila OS",
            },
            { rotulo: "Sitemap", valor: sitemapUrl, mono: true, copiar: sitemapUrl },
          ]}
        />

        {sitemaps.length === 0 ? (
          <EstadoVazio
            compacto
            titulo="Nenhum sitemap registrado ainda no Search Console."
            descricao="Envie o sitemap para registrá-lo."
            acao={
              <Button type="button" variant="outline" onClick={handleSubmit} disabled={ocupado} className={BOTAO}>
                {status === "sending" ? "Enviando..." : "Enviar sitemap agora"}
              </Button>
            }
          />
        ) : (
          <CartaoLista titulo="Sitemaps no Search Console">
            <ul className="m-0 list-none p-0">
              {sitemaps.map((entry) => (
                <li
                  key={entry.path}
                  className="flex min-h-[56px] flex-col gap-1 border-b border-border px-4 py-3 last:border-b-0 min-[821px]:flex-row min-[821px]:items-center min-[821px]:gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-all font-mono text-[13px] text-foreground">{entry.path}</p>
                    {entry.errors ? (
                      <p className="text-[13px] text-[color:var(--red)]">{entry.errors}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {entry.isPending ? (
                      <BadgeStatus status="processing" texto="Processando" />
                    ) : (
                      <BadgeStatus status="done" texto="Processado" />
                    )}
                    <span className="font-mono text-[13px] tabular-nums text-muted-foreground">
                      {entry.lastSubmitted ? new Date(entry.lastSubmitted).toLocaleDateString("pt-BR") : "—"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </CartaoLista>
        )}
      </CardContent>
    </Card>
  );
}
