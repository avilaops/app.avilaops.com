"use client";

import { useState } from "react";
import BadgeStatus from "@/components/sistema/Status";
import ListaChaveValor, { type ItemChaveValor } from "@/components/hub-social/ListaChaveValor";
import GradeMetricas, { Metrica } from "@/components/hub-social/Metricas";
import { Button } from "@/components/shadcn/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shadcn/card";
import {
  ACOES,
  BOTAO,
  evidenciaConexao,
  MensagemErro,
  MensagemStatus,
  rotuloIntegracao,
  tomNota,
  type Conexao,
} from "@/components/hub-social/comum";
import type { DomainSeoAuditResult } from "@/lib/seo-audit";
import type { PageSpeedAuditResult } from "@/lib/pagespeed";

type Connection = Conexao;

export default function SeoAuditPanel({
  fqdn,
  initialSeoConnection,
  initialLighthouseConnection,
}: {
  fqdn: string;
  initialSeoConnection: Connection;
  initialLighthouseConnection: Connection;
}) {
  const [seoConnection, setSeoConnection] = useState(initialSeoConnection);
  const [lighthouseConnection, setLighthouseConnection] = useState(initialLighthouseConnection);
  const [status, setStatus] = useState<"idle" | "running">("idle");
  const [message, setMessage] = useState("");
  // Só decide a apresentação da mensagem (status ou alerta); a lógica é a mesma.
  const [falhou, setFalhou] = useState(false);

  const seoData = seoConnection?.metadata as DomainSeoAuditResult | undefined;
  const psiData = lighthouseConnection?.metadata as PageSpeedAuditResult | undefined;

  async function runAudit(targetFqdn?: string) {
    setStatus("running");
    setMessage("");
    setFalhou(false);

    try {
      const target = targetFqdn || fqdn;
      const [seoRes, psiRes] = await Promise.all([
        fetch("/api/integrations/seo-audit/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fqdn: target }),
        }),
        fetch("/api/integrations/lighthouse/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fqdn: target }),
        }),
      ]);

      const seoJson = await seoRes.json();
      const psiJson = await psiRes.json();

      if (seoJson.result) {
        setSeoConnection({
          id: "seo_audit",
          status: seoJson.result.status,
          lastSyncedAt: seoJson.result.checkedAt,
          lastSyncStatus: "SUCCESS",
          lastSyncError: seoJson.result.error || null,
          metadata: seoJson.result,
        });
      }

      if (psiJson.result) {
        setLighthouseConnection({
          id: "lighthouse",
          status: psiJson.result.status,
          lastSyncedAt: psiJson.result.checkedAt,
          lastSyncStatus: "SUCCESS",
          lastSyncError: psiJson.result.error || null,
          metadata: psiJson.result,
        });
      }

      setMessage(`Auditoria técnica e PageSpeed concluídos para ${target}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao executar auditoria.");
      setFalhou(true);
    } finally {
      setStatus("idle");
    }
  }

  async function runAutoFix() {
    setStatus("running");
    setMessage("");
    setFalhou(false);

    try {
      const res = await fetch("/api/integrations/seo-audit/autofix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fqdn }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Falha ao aplicar Auto-Fix SEO.");
      }

      setMessage(`Correções seguras aplicadas em ${fqdn}. Executando uma nova auditoria.`);
      await runAudit(fqdn);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha no Auto-Fix SEO.");
      setFalhou(true);
      setStatus("idle");
    }
  }

  const score = seoData?.score ?? null;
  // Coleta falha não vira nota: sem medição o campo fica "Pendente".
  const perfMeasured = psiData?.measured !== false && typeof psiData?.performanceScore === "number";
  const perfScore = perfMeasured ? psiData!.performanceScore : null;

  const verificacao = (ok: boolean | undefined, aprovado: string, reprovado: string) => (
    <BadgeStatus
      status={ok ? "ok" : seoData ? "fail" : null}
      texto={ok ? aprovado : reprovado}
      tom={ok ? "bom" : seoData ? "atencao" : "neutro"}
    />
  );

  const checklist: ItemChaveValor[] = [
    {
      rotulo: "robots.txt",
      valor: (
        <>
          {verificacao(seoData?.robots.ok, "Aprovado", "Ausente ou com erro")}
          {seoData?.robots.hasSitemap ? <span className="text-[13px] text-muted-foreground">Sitemap OK</span> : null}
        </>
      ),
    },
    {
      rotulo: "sitemap.xml",
      valor: seoData?.sitemap.ok
        ? verificacao(true, `Aprovado (${seoData.sitemap.urlCount} URLs)`, "Ausente")
        : verificacao(false, "Aprovado", "Ausente"),
    },
    { rotulo: "llms.txt", valor: verificacao(seoData?.llms.ok, "Aprovado", "Ausente") },
    { rotulo: "Favicon", valor: verificacao(seoData?.favicon.ok, "Aprovado", "Faltando") },
    { rotulo: "Manifest.json", valor: verificacao(seoData?.manifest.ok, "Aprovado", "Ausente") },
    { rotulo: "URL canônica", valor: verificacao(seoData?.homeHtml.hasCanonical, "Aprovada", "Faltando") },
    {
      rotulo: "Open Graph",
      valor: verificacao(
        Boolean(seoData?.homeHtml.hasOgTitle && seoData?.homeHtml.hasOgDescription),
        "Aprovado",
        "Incompleto",
      ),
    },
    { rotulo: "Schema.org / JSON-LD", valor: verificacao(seoData?.homeHtml.hasJsonLd, "Detectado", "Ausente") },
  ];

  const ocupado = status === "running";

  return (
    <Card className="gap-5 shadow-none">
      <CardHeader className="px-4 min-[821px]:px-6">
        <CardTitle className="text-[17px] min-[821px]:text-[15px]">Auditoria de {fqdn}</CardTitle>
        <CardDescription>Verifica indexação, metadados e experiência de carregamento.</CardDescription>
        <CardAction>
          <BadgeStatus {...rotuloIntegracao(seoConnection?.status, "Sem auditoria")} />
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-5 px-4 min-[821px]:px-6">
        <div className={ACOES}>
          <Button type="button" onClick={() => runAudit(fqdn)} disabled={ocupado} className={BOTAO}>
            {ocupado ? "Analisando..." : "Executar auditoria"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={runAutoFix}
            disabled={ocupado}
            title="Aplica somente correções automáticas já autorizadas e executa uma nova auditoria"
            className={BOTAO}
          >
            Aplicar correções seguras
          </Button>
        </div>

        {message ? falhou ? <MensagemErro>{message}</MensagemErro> : <MensagemStatus>{message}</MensagemStatus> : null}

        <GradeMetricas rotulo="Notas da auditoria">
          <Metrica
            rotulo="Score SEO técnico"
            valor={score !== null ? `${score}/100` : "Pendente"}
            tom={tomNota(score, 75, 45)}
            evidencia={evidenciaConexao(
              "Score SEO técnico",
              "POST /api/integrations/seo-audit/run",
              "score de DomainSeoAuditResult (robots, sitemap, llms, favicon, manifest e HTML da página inicial)",
              seoConnection,
            )}
          />
          <Metrica
            rotulo="Performance (Lighthouse)"
            valor={perfScore !== null ? `${perfScore}/100` : "Pendente"}
            tom={tomNota(perfScore, 80, 50)}
            evidencia={evidenciaConexao(
              "Performance (Lighthouse)",
              "POST /api/integrations/lighthouse/run",
              "performanceScore do PageSpeed Insights; sem nota quando measured = false",
              lighthouseConnection,
            )}
          />
        </GradeMetricas>

        <ListaChaveValor
          titulo="Core Web Vitals"
          itens={[
            { rotulo: "Maior conteúdo (LCP)", valor: psiData?.lcp, mono: true, vazio: "Sem medição" },
            { rotulo: "Estabilidade visual (CLS)", valor: psiData?.cls, mono: true, vazio: "Sem medição" },
            { rotulo: "Interação (INP)", valor: psiData?.inp, mono: true, vazio: "Sem medição" },
          ]}
        />

        <ListaChaveValor titulo="Checklist de saúde técnica" itens={checklist} compacto />
      </CardContent>
    </Card>
  );
}
