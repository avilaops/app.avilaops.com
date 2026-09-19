"use client";

import { useState } from "react";
import BotaoEvidencia from "@/components/hub-social/FolhaEvidencia";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import type { Evidencia } from "@/lib/evidencia";
import { cn } from "@/lib/utils";

/**
 * Consulta de um domínio avulso antes de vender ou registrar.
 *
 * Domínio `.br` vai ao RDAP do Registro.br, que é o registro autoritativo e
 * devolve também vencimento e titular; o resto do mundo vai pelo `rdap.org`.
 * Nenhum dos dois cobra, e nenhum dos dois registra: registrar `.br` exige
 * EPP, que é restrito a provedor credenciado pelo NIC.br. Por isso o resultado
 * é sempre uma informação, nunca um botão de comprar.
 */

type Resultado = {
  domain: string;
  status: "AVAILABLE" | "UNAVAILABLE" | "BLOCKED" | "UNKNOWN";
  source: "REGISTRO_BR" | "RDAP";
  message: string;
  expiresAt?: string | null;
  holder?: string | null;
  cached?: boolean;
};

const ROTULO: Record<Resultado["status"], string> = {
  AVAILABLE: "Livre",
  UNAVAILABLE: "Registrado",
  BLOCKED: "Indisponível",
  UNKNOWN: "Sem resposta",
};

const TOM: Record<Resultado["status"], string> = {
  AVAILABLE: "text-[color:var(--green)]",
  UNAVAILABLE: "text-foreground",
  BLOCKED: "text-[color:var(--amber)]",
  UNKNOWN: "text-muted-foreground",
};

const FONTE: Record<Resultado["source"], string> = {
  REGISTRO_BR: "rdap.registro.br (registro autoritativo do .br)",
  RDAP: "rdap.org (bootstrap da IANA)",
};

const formatoData = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" });

function formatarData(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? null : formatoData.format(data);
}

export default function ConsultaRegistroBr() {
  const [termo, setTermo] = useState("");
  const [consultando, setConsultando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [lidoEm, setLidoEm] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  async function consultar(evento: React.FormEvent) {
    evento.preventDefault();
    const alvo = termo.trim();
    if (!alvo || consultando) return;

    setConsultando(true);
    setErro("");
    setResultado(null);

    try {
      const resposta = await fetch("/api/domains/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: alvo }),
      });
      const dados = await resposta.json();

      if (!resposta.ok) {
        setErro(dados.error ?? "Não foi possível consultar o domínio.");
        return;
      }

      setResultado(dados as Resultado);
      setLidoEm(new Date().toISOString());
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível consultar o domínio.");
    } finally {
      setConsultando(false);
    }
  }

  const expira = formatarData(resultado?.expiresAt);

  const evidencia: Evidencia | null = resultado
    ? {
        rotulo: `Consulta de ${resultado.domain}`,
        origem: FONTE[resultado.source],
        funcao: "checkDomainAvailability() em src/lib/domain-availability.ts, via POST /api/domains/availability",
        formula:
          resultado.source === "REGISTRO_BR"
            ? "RDAP 404 = livre, RDAP 200 = registrado; vencimento vem do evento expiration, e o endpoint de busca do site do Registro.br entra só para explicar nome reservado"
            : "RDAP 404 = livre, RDAP 200 = registrado; este registro não publica vencimento",
        lidoEm,
        gravadoEm: null,
        observacao: resultado.cached
          ? "Resposta servida do cache em memória (6 h para registrado, 5 min para livre), não da rede."
          : "Leitura feita na hora, direto na fonte. Nada desta consulta é gravado no banco.",
        bruto: resultado,
      }
    : null;

  return (
    <Card className="w-full min-w-0 gap-0 overflow-hidden py-0 shadow-none">
      <div className="border-b border-border px-4 pt-4 pb-3">
        <h2 className="text-[15px] font-semibold text-foreground">Consultar um domínio</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Leitura pública e gratuita. Registrar ou renovar um .br continua sendo pelo Registro.br, e não há API para isso.
        </p>
      </div>

      <form onSubmit={consultar} className="flex flex-col gap-3 px-4 py-4 min-[560px]:flex-row min-[560px]:items-end">
        <div className="min-w-0 flex-1">
          <Label htmlFor="consulta-dominio" className="text-[13px] text-muted-foreground">
            Domínio
          </Label>
          <Input
            id="consulta-dominio"
            type="text"
            inputMode="url"
            value={termo}
            onChange={(evento) => setTermo(evento.target.value)}
            placeholder="empresa.com.br"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className="mt-1 h-11 font-mono text-[15px] min-[821px]:h-9 min-[821px]:text-sm"
          />
        </div>
        <Button
          type="submit"
          disabled={consultando || termo.trim().length === 0}
          className="min-h-[50px] w-full text-[15px] min-[560px]:w-auto min-[821px]:min-h-10 min-[821px]:text-sm"
        >
          {consultando ? "Consultando…" : "Consultar"}
        </Button>
      </form>

      {erro ? (
        <p role="alert" className="px-4 pb-4 text-[15px] leading-[1.5] text-[color:var(--red)] min-[821px]:text-sm">
          {erro}
        </p>
      ) : null}

      {resultado ? (
        <div className="border-t border-border px-4 py-3" aria-live="polite">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-mono text-[15px] font-medium text-foreground min-[821px]:text-sm">
              {resultado.domain}
            </span>
            <strong className={cn("text-[15px] font-semibold min-[821px]:text-sm", TOM[resultado.status])}>
              {ROTULO[resultado.status]}
            </strong>
            {evidencia ? (
              <span className="ml-auto">
                <BotaoEvidencia evidencia={evidencia} rotulo={`Evidência da consulta de ${resultado.domain}`} />
              </span>
            ) : null}
          </div>

          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{resultado.message}</p>

          {resultado.holder || expira ? (
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px] leading-5">
              {resultado.holder ? (
                <>
                  <dt className="text-muted-foreground">Titular</dt>
                  <dd className="m-0 text-foreground">{resultado.holder}</dd>
                </>
              ) : null}
              {expira ? (
                <>
                  <dt className="text-muted-foreground">Expira</dt>
                  <dd className="m-0 text-foreground tabular-nums">{expira}</dd>
                </>
              ) : null}
            </dl>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
