"use client";

import type { ReactNode } from "react";

/* Peças que os painéis da ficha (provisionamento e operação) dividem. */

export type Resultado = { tipo: "ok" | "erro"; conteudo: ReactNode };

export const classeStatus: Record<string, string> = {
  ACTIVE: "status-active",
  DONE: "status-active",
  PAID: "status-active",
  PENDING: "status-pending",
  OPEN: "status-pending",
  IN_PROGRESS: "status-pending",
  ATTENTION: "status-paused",
  OVERDUE: "status-paused",
  PAUSED: "status-paused",
  BLOCKED: "status-paused",
  FAILED: "status-ignored",
  CANCELLED: "status-ignored",
  ARCHIVED: "status-ignored",
  active: "status-active",
  pending: "status-pending",
};

export const rotuloStatus: Record<string, string> = {
  ACTIVE: "Ativo",
  DONE: "Concluída",
  PAID: "Paga",
  PENDING: "Pendente",
  OPEN: "Em aberto",
  IN_PROGRESS: "Em andamento",
  ATTENTION: "Com pendências",
  OVERDUE: "Vencida",
  PAUSED: "Pausada",
  BLOCKED: "Bloqueada",
  FAILED: "Falhou",
  CANCELLED: "Cancelada",
  ARCHIVED: "Arquivado",
  active: "Ativa",
  pending: "Aguardando NS",
  initializing: "Iniciando",
  moved: "Movida",
};

export async function chamar<T = Record<string, unknown>>(
  url: string,
  body: Record<string, unknown>,
  method: "POST" | "PATCH" | "DELETE" = "POST",
): Promise<T> {
  const resposta = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const dados = (await resposta.json().catch(() => ({}))) as T & { error?: string };
  if (!resposta.ok) throw new Error(dados.error ?? `Falhou (HTTP ${resposta.status}).`);
  return dados;
}

export function Pill({ status }: { status: string | null }) {
  if (!status) return null;
  return (
    <span className={`status-pill ${classeStatus[status] ?? ""}`}>
      {rotuloStatus[status] ?? status}
    </span>
  );
}

export function Cartao({
  titulo,
  descricao,
  children,
  acoes,
  resultado,
}: {
  titulo: string;
  /** Só quando o título não basta. Card não é lugar de manual. */
  descricao?: string;
  children: ReactNode;
  acoes: ReactNode;
  resultado: Resultado | null;
}) {
  return (
    <article className="operations-panel prov-card">
      <div className="prov-card-head">
        <div>
          <h3>{titulo}</h3>
          {descricao ? <p>{descricao}</p> : null}
        </div>
      </div>
      {children}
      {resultado ? (
        <div className={resultado.tipo === "erro" ? "prov-result prov-result-erro" : "prov-result"} role="status">
          {resultado.conteudo}
        </div>
      ) : null}
      <div className="prov-actions">{acoes}</div>
    </article>
  );
}

export function dinheiro(cents: number, moeda = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda }).format(cents / 100);
}

export function dataCurta(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "UTC" }).format(new Date(iso));
}
