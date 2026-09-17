"use client";

import { useState } from "react";
import ListaChaveValor from "@/components/hub-social/ListaChaveValor";
import BadgeStatus from "@/components/hub-social/BadgeStatus";
import GradeMetricas, { Metrica } from "@/components/hub-social/Metricas";
import { Button } from "@/components/shadcn/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shadcn/card";
import {
  ACOES,
  BOTAO,
  evidenciaConexao,
  formatarDataHora,
  MensagemErro,
  MensagemStatus,
  rotuloSeo,
  type ConexaoSeo,
} from "@/components/seo/comum";

type Connection = ConexaoSeo;

function metadataValue(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export default function IndexNowPanel({
  fqdn,
  initialConnection,
}: {
  fqdn: string;
  initialConnection: Connection;
}) {
  const [connection, setConnection] = useState(initialConnection);
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [message, setMessage] = useState("");
  const [batchMessage, setBatchMessage] = useState("");

  async function submitIndexNow() {
    setStatus("sending");
    setMessage("");

    try {
      const response = await fetch("/api/integrations/indexnow/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fqdn }),
      });
      const data = await response.json();
      setConnection(data.connection ?? null);

      if (!response.ok || !data.ok) {
        setMessage(
          data.keyAudit?.error ??
            data.error ??
            "Não foi possível enviar URLs ao IndexNow.",
        );
      } else {
        setMessage(`${data.submitted ?? 0} URLs enviadas ao IndexNow.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha no envio IndexNow.");
    } finally {
      setStatus("done");
      window.setTimeout(() => setStatus("idle"), 2500);
    }
  }

  async function submitAllIndexNow() {
    setStatus("sending");
    setBatchMessage("");

    try {
      const response = await fetch("/api/integrations/indexnow/submit-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();
      setBatchMessage(
        `${data.successful ?? 0}/${data.total ?? 0} domínios enviados. ${
          data.failed ? `${data.failed} exigem correção.` : ""
        }`,
      );
    } catch (error) {
      setBatchMessage(
        error instanceof Error ? error.message : "Falha no envio em lote.",
      );
    } finally {
      setStatus("done");
      window.setTimeout(() => setStatus("idle"), 2500);
    }
  }

  const submittedCount = metadataValue(connection?.metadata, "submittedCount");
  const keyLocation = metadataValue(connection?.metadata, "keyLocation");
  const canonicalHost = metadataValue(connection?.metadata, "canonicalHost");

  const ocupado = status !== "idle";
  const redirecionado = connection?.lastSyncStatus === "REDIRECT_DOMAIN" && canonicalHost;
  const arquivoChave = keyLocation || `https://${fqdn}/[INDEXNOW_KEY].txt`;

  return (
    <Card className="gap-5 shadow-none">
      <CardHeader className="px-4 min-[821px]:px-6">
        <CardTitle className="text-[17px] min-[821px]:text-[15px]">Bing e IndexNow</CardTitle>
        <CardDescription className="break-all">{fqdn}</CardDescription>
        <CardAction>
          <BadgeStatus {...rotuloSeo(connection?.lastSyncStatus, "Nunca enviado")} />
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-5 px-4 min-[821px]:px-6">
        <div className={ACOES}>
          <Button type="button" onClick={submitIndexNow} disabled={ocupado} className={BOTAO}>
            {status === "sending" ? "Enviando..." : "Enviar URLs agora"}
          </Button>
          <Button type="button" variant="outline" onClick={submitAllIndexNow} disabled={ocupado} className={BOTAO}>
            {status === "sending" ? "Enviando..." : "Enviar todos"}
          </Button>
        </div>

        {message ? (
          connection?.lastSyncStatus === "SUCCESS" ? (
            <MensagemStatus>
              <strong className="font-semibold">Envio concluído.</strong> {message}
            </MensagemStatus>
          ) : (
            <MensagemErro>
              <strong className="font-semibold">Ação necessária.</strong> {message}
            </MensagemErro>
          )
        ) : null}

        {batchMessage ? (
          <MensagemStatus>
            <strong className="font-semibold">Envio em lote concluído.</strong> {batchMessage}
          </MensagemStatus>
        ) : null}

        <GradeMetricas rotulo="Envios ao IndexNow">
          <Metrica
            rotulo="URLs enviadas"
            valor={redirecionado ? "—" : submittedCount || "—"}
            detalhe={redirecionado ? `Canônico: ${canonicalHost}` : undefined}
            evidencia={evidenciaConexao(
              "URLs enviadas",
              "POST /api/integrations/indexnow/submit",
              "metadata.submittedCount do último envio; domínio redirecionado mostra o host canônico",
              connection,
            )}
          />
        </GradeMetricas>

        <ListaChaveValor
          titulo="Último envio"
          itens={[
            { rotulo: "Enviado em", valor: formatarDataHora(connection?.lastSyncedAt), vazio: "Nunca enviado" },
            {
              rotulo: "Status",
              valor: connection?.lastSyncStatus ? <BadgeStatus {...rotuloSeo(connection.lastSyncStatus)} /> : null,
            },
            { rotulo: "Arquivo de chave", valor: arquivoChave, mono: true, copiar: arquivoChave },
            ...(redirecionado ? [{ rotulo: "Host canônico", valor: canonicalHost, mono: true }] : []),
          ]}
        />
      </CardContent>
    </Card>
  );
}
