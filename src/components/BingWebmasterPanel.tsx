"use client";

import { useState } from "react";
import ListaChaveValor from "@/components/hub-social/ListaChaveValor";
import BadgeStatus from "@/components/sistema/Status";
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
  rotuloIntegracao,
  type Conexao,
} from "@/components/hub-social/comum";

type Connection = Conexao;

function metadataArrayLength(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.length : null;
}

export default function BingWebmasterPanel({
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

  async function submitBing() {
    setStatus("sending");
    setMessage("");

    try {
      const response = await fetch("/api/integrations/bing-webmaster/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fqdn }),
      });
      const data = await response.json();
      const result = data.result;

      setConnection({
        id: connection?.id ?? "bing_webmaster",
        status: result?.success ? "ACTIVE" : "FAIL",
        lastSyncedAt: result?.submittedAt ?? null,
        lastSyncStatus: result?.success ? "SUCCESS" : "ERROR",
        lastSyncError: result?.error ?? null,
        metadata: result,
      });

      if (!response.ok || !result?.success) {
        setMessage(result?.error ?? "Não foi possível enviar URLs ao Bing Webmaster.");
      } else {
        setMessage(`${result.urlsSubmitted?.length ?? 0} URLs enviadas ao Bing.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha no envio ao Bing.");
    } finally {
      setStatus("done");
      window.setTimeout(() => setStatus("idle"), 2500);
    }
  }

  async function submitAllBing() {
    setStatus("sending");
    setBatchMessage("");

    try {
      const response = await fetch("/api/integrations/bing-webmaster/run", {
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
      setBatchMessage(error instanceof Error ? error.message : "Falha no envio em lote.");
    } finally {
      setStatus("done");
      window.setTimeout(() => setStatus("idle"), 2500);
    }
  }

  const submittedCount = metadataArrayLength(connection?.metadata, "urlsSubmitted");

  const ocupado = status !== "idle";

  return (
    <Card className="gap-5 shadow-none">
      <CardHeader className="px-4 min-[821px]:px-6">
        <CardTitle className="text-[17px] min-[821px]:text-[15px]">Bing Webmaster Tools</CardTitle>
        <CardDescription className="break-all">{fqdn}</CardDescription>
        <CardAction>
          <BadgeStatus {...rotuloIntegracao(connection?.lastSyncStatus, "Nunca enviado")} />
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-5 px-4 min-[821px]:px-6">
        <div className={ACOES}>
          <Button type="button" onClick={submitBing} disabled={ocupado} className={BOTAO}>
            {status === "sending" ? "Enviando..." : "Enviar sitemap agora"}
          </Button>
          <Button type="button" variant="outline" onClick={submitAllBing} disabled={ocupado} className={BOTAO}>
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

        <GradeMetricas rotulo="Envios ao Bing">
          <Metrica
            rotulo="URLs enviadas"
            valor={submittedCount ?? "—"}
            evidencia={evidenciaConexao(
              "URLs enviadas",
              "POST /api/integrations/bing-webmaster/run",
              "tamanho de metadata.urlsSubmitted do último envio",
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
              valor: connection?.lastSyncStatus ? <BadgeStatus {...rotuloIntegracao(connection.lastSyncStatus)} /> : null,
            },
            ...(connection?.lastSyncError ? [{ rotulo: "Erro", valor: connection.lastSyncError }] : []),
          ]}
        />
      </CardContent>
    </Card>
  );
}
