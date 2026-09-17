import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { Evidencia } from "@/lib/evidencia";
import type { TomStatus } from "@/lib/status-rotulos";
import type { TomMetrica } from "@/components/hub-social/Metricas";
import { cn } from "@/lib/utils";

/**
 * Peças pequenas do SEO usadas tanto pelos componentes de servidor quanto
 * pelos quatro painéis de cliente. Sem estado e sem "use client".
 */

export type ConexaoSeo = {
  id: string;
  status: string;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  metadata?: unknown;
} | null;

/** Medidas da casa: campo 48px e botão 50px em largura total abaixo de 821px. */
export const CAMPO = "h-12 text-[16px] md:text-[16px] min-[821px]:h-9 min-[821px]:text-sm";

export const BOTAO = "min-h-[50px] w-full text-[15px] min-[821px]:min-h-9 min-[821px]:w-auto min-[821px]:text-sm";

export const ACOES = "flex flex-col gap-2 min-[821px]:flex-row min-[821px]:flex-wrap min-[821px]:justify-end";

const formatoDataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export function formatarDataHora(valor: string | Date | null | undefined): string | null {
  if (!valor) return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : formatoDataHora.format(data);
}

/**
 * Códigos que as rotas de SEO gravam em status/lastSyncStatus e que o mapa
 * geral (status-rotulos) não conhece ou traduz de outro jeito.
 */
const ROTULOS_SEO: Record<string, { texto: string; tom: TomStatus }> = {
  SUCCESS: { texto: "Concluído", tom: "bom" },
  ACTIVE: { texto: "Ativo", tom: "bom" },
  WARNING: { texto: "Atenção", tom: "atencao" },
  FAIL: { texto: "Falha", tom: "ruim" },
  ERROR: { texto: "Erro", tom: "ruim" },
  REDIRECT_DOMAIN: { texto: "Domínio redirecionado", tom: "atencao" },
  UNKNOWN: { texto: "Sem medição", tom: "neutro" },
};

/** Props para BadgeStatus: texto e tom locais quando o código é do SEO. */
export function rotuloSeo(codigo: string | null | undefined, vazio = "Não configurado") {
  if (!codigo) return { status: null, texto: vazio, tom: "neutro" as TomStatus };
  const conhecido = ROTULOS_SEO[codigo.toUpperCase()];
  return conhecido ? { status: codigo, ...conhecido } : { status: codigo };
}

/** Tom de uma nota 0–100: bom a partir de `bom`, atenção a partir de `atencao`. */
export function tomNota(nota: number | null | undefined, bom: number, atencao: number): TomMetrica {
  if (typeof nota !== "number") return "neutro";
  return nota >= bom ? "bom" : nota >= atencao ? "atencao" : "ruim";
}

/** Evidência de um número que veio do metadata de uma integrationConnection. */
export function evidenciaConexao(
  rotulo: string,
  origem: string,
  formula: string,
  conexao: { id: string; lastSyncedAt: string | Date | null; metadata?: unknown } | null,
  extra?: Partial<Evidencia>,
): Evidencia {
  const gravadoEm = conexao?.lastSyncedAt ? new Date(conexao.lastSyncedAt).toISOString() : null;
  return {
    rotulo,
    origem,
    formula,
    gravadoEm,
    referencia: conexao?.id ?? null,
    bruto: conexao?.metadata,
    observacao: conexao ? "Gravado em = lastSyncedAt da conexão." : "Nenhuma medição gravada para este domínio.",
    ...extra,
  };
}

export function MensagemStatus({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="text-[15px] leading-[1.5] text-foreground min-[821px]:text-sm">
      {children}
    </p>
  );
}

export function MensagemErro({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-[15px] leading-[1.5] text-[color:var(--red)] min-[821px]:text-sm">
      {children}
    </p>
  );
}

export function Chevron({ className }: { className?: string }) {
  return <ChevronRight aria-hidden="true" className={cn("size-4 shrink-0 text-muted-foreground", className)} />;
}

/** Cartão de lista agrupada com cabeçalho opcional; as linhas vêm como filhos. */
export function CartaoLista({
  titulo,
  descricao,
  acao,
  children,
  rotulo,
}: {
  titulo?: string;
  descricao?: string;
  acao?: ReactNode;
  children: ReactNode;
  rotulo?: string;
}) {
  return (
    <section
      aria-label={titulo ? undefined : rotulo}
      className="w-full min-w-0 overflow-hidden rounded-xl border border-border bg-card"
    >
      {titulo || acao ? (
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 pt-4 pb-3">
          <div className="min-w-0">
            {titulo ? (
              <h2 className="text-[17px] font-semibold text-foreground min-[821px]:text-[15px]">{titulo}</h2>
            ) : null}
            {descricao ? <p className="mt-0.5 text-[13px] text-muted-foreground">{descricao}</p> : null}
          </div>
          {acao}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/** Item de lista agrupada: a divisória fica no <li>. */
export const LINHA_ITEM = "border-b border-border last:border-b-0";

/** Classes da linha-link: área de toque na linha inteira, pressionar 1,5 % por 60ms. */
export const LINHA_LINK = cn(
  "flex w-full items-center gap-3 px-4 py-3 text-foreground no-underline",
  "outline-none transition-transform duration-[60ms] hover:bg-accent active:scale-[0.985] motion-reduce:transition-none motion-reduce:active:scale-100",
  "focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50",
);
