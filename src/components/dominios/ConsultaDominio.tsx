"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import BotaoEvidencia from "@/components/hub-social/FolhaEvidencia";
import { BOTAO, CAMPO, CartaoLista, MensagemErro } from "@/components/hub-social/comum";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import type { Evidencia } from "@/lib/evidencia";
import { cn } from "@/lib/utils";

/**
 * Consulta de disponibilidade.
 *
 * O usuário digita um domínio e recebe uma frase. O que sustenta a resposta
 * por baixo (qual registro respondeu, por qual protocolo) fica na folha de
 * evidência, que é onde dado técnico serve para conferir, não para decorar a
 * tela.
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

const TITULO: Record<Resultado["status"], string> = {
  AVAILABLE: "Domínio disponível",
  UNAVAILABLE: "Domínio indisponível",
  BLOCKED: "Nome não aceito",
  UNKNOWN: "Sem resposta agora",
};

const TOM: Record<Resultado["status"], string> = {
  AVAILABLE: "text-[color:var(--green)]",
  UNAVAILABLE: "text-foreground",
  BLOCKED: "text-[color:var(--amber)]",
  UNKNOWN: "text-muted-foreground",
};

/** Só isto pode nomear a fonte, e só dentro da folha de evidência. */
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

export default function ConsultaDominio({
  hrefRegistrar,
  valorInicial = "",
  compacto = false,
}: {
  /** Nulo enquanto registrar não estiver habilitado: sem botão que não funciona. */
  hrefRegistrar: string | null;
  valorInicial?: string;
  compacto?: boolean;
}) {
  const [termo, setTermo] = useState(valorInicial);
  const [consultando, setConsultando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [lidoEm, setLidoEm] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  async function consultar(evento: FormEvent) {
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
        funcao: "checkDomainAvailability() em src/lib/domain-availability.ts",
        formula:
          resultado.source === "REGISTRO_BR"
            ? "sem registro = livre; com registro = indisponível. O vencimento vem do evento de expiração, e a busca do registro explica nome reservado"
            : "sem registro = livre; com registro = indisponível. Este registro não publica vencimento",
        lidoEm,
        gravadoEm: null,
        observacao: resultado.cached
          ? "Resposta servida do cache em memória, não da rede."
          : "Leitura feita na hora. Nada desta consulta é gravado.",
        bruto: resultado,
      }
    : null;

  return (
    <CartaoLista
      titulo={compacto ? undefined : "Consultar domínio"}
      descricao={compacto ? undefined : "Verifique se um domínio está livre antes de oferecer ao cliente."}
      rotulo="Consulta de disponibilidade"
    >
      <form onSubmit={consultar} className="flex flex-col gap-3 px-4 py-4 min-[821px]:flex-row min-[821px]:items-end">
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
            placeholder="minhaempresa.com.br"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className={cn("mt-1 font-mono", CAMPO)}
          />
        </div>
        <button type="submit" disabled={consultando || termo.trim().length === 0} className={cn("primary-button", BOTAO)}>
          {consultando ? "Consultando…" : "Consultar"}
        </button>
      </form>

      {erro ? (
        <div className="px-4 pb-4">
          <MensagemErro>{erro}</MensagemErro>
        </div>
      ) : null}

      {resultado ? (
        <div className="border-t border-border px-4 py-4" aria-live="polite">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <strong className={cn("text-[15px] font-semibold", TOM[resultado.status])}>
              {TITULO[resultado.status]}
            </strong>
            {evidencia ? (
              <span className="ml-auto">
                <BotaoEvidencia evidencia={evidencia} rotulo={`Evidência da consulta de ${resultado.domain}`} />
              </span>
            ) : null}
          </div>

          <p className="mt-1 font-mono text-[14px] text-foreground">{resultado.domain}</p>
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{resultado.message}</p>

          {resultado.holder || expira ? (
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px] leading-5">
              {resultado.holder ? (
                <>
                  <dt className="text-muted-foreground">Titular</dt>
                  <dd className="m-0 text-foreground">{resultado.holder}</dd>
                </>
              ) : null}
              {expira ? (
                <>
                  <dt className="text-muted-foreground">Expira</dt>
                  <dd className="m-0 tabular-nums text-foreground">{expira}</dd>
                </>
              ) : null}
            </dl>
          ) : null}

          {resultado.status === "AVAILABLE" ? (
            <div className="mt-4">
              {hrefRegistrar ? (
                <Link
                  href={`${hrefRegistrar}&dominio=${encodeURIComponent(resultado.domain)}`}
                  className={cn("primary-button", BOTAO)}
                >
                  Registrar domínio
                </Link>
              ) : (
                <p className="text-[13px] leading-5 text-muted-foreground">
                  O registro por aqui ainda não está habilitado nesta conta. Este domínio está livre e pode ser
                  registrado pelo caminho de sempre.
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </CartaoLista>
  );
}
