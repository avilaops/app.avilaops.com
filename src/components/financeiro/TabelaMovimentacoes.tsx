"use client";

import { useCallback, useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import EditorEscopo, { COR_ESCOPO } from "@/components/financeiro/EditorEscopo";
import FolhaRevisao from "@/components/financeiro/FolhaRevisao";
import type { LinhaMovimentacao } from "@/components/financeiro/tipos";
import { Button } from "@/components/shadcn/button";
import { SCOPE_LABELS, type FinanceScope } from "@/lib/finance-escopo";
import { rotuloEstado, rotuloTipoMovimentacao, rotuloVinculo } from "@/lib/financeiro-rotulos";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type { LinhaMovimentacao };

const COR_ESTADO: Record<string, string> = {
  PENDING: "bg-[color:var(--amber-line)]/60 text-[color:var(--amber)]",
  REVIEW: "bg-[color:var(--blue-soft)] text-[color:var(--blue)]",
  MATCHED: "bg-[color:var(--green-line)]/60 text-[color:var(--green)]",
  IGNORED: "bg-[color:var(--surface-soft)] text-muted-foreground",
};

function Valor({ linha, className }: { linha: LinhaMovimentacao; className?: string }) {
  const entrada = linha.direction === "CREDIT";
  return (
    <span
      className={cn(
        "whitespace-nowrap tabular-nums",
        entrada ? "text-[color:var(--green)]" : "text-foreground",
        className,
      )}
    >
      {entrada ? "+" : "−"} {formatCurrency(linha.amount, linha.currency)}
    </span>
  );
}

function Estado({ linha }: { linha: LinhaMovimentacao }) {
  const status = linha.reconciliation?.status ?? "PENDING";
  const vinculo = rotuloVinculo(linha.reconciliation?.referenceType, linha.reconciliation?.referenceId);
  return (
    <span className="flex min-w-0 flex-col items-start gap-0.5">
      <span className={cn("rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap", COR_ESTADO[status])}>
        {rotuloEstado(status)}
      </span>
      {vinculo ? (
        <span
          className="max-w-full truncate text-[12px] text-muted-foreground"
          title={
            linha.reconciliation?.referenceType === "COMPROVANTE"
              ? `Comprovante Pix ${linha.reconciliation.referenceId}`
              : undefined
          }
        >
          {vinculo}
        </span>
      ) : null}
    </span>
  );
}

/** Quem está do outro lado; o extrato do Éfi não traz o pagador em Pix recebido. */
function titulo(linha: LinhaMovimentacao) {
  return linha.counterpartyName ?? (linha.description || "Não informado");
}

/**
 * A descrição do extrato só aparece quando acrescenta algo: no Éfi ela é
 * "Pix enviado", igual ao tipo, e no cartão costuma ser o próprio nome da
 * contraparte.
 */
function detalheExtra(l: LinhaMovimentacao) {
  const d = l.description?.trim();
  if (!d || !l.counterpartyName) return null;
  if (d === l.counterpartyName || d === rotuloTipoMovimentacao(l.transactionType)) return null;
  return d;
}

/**
 * Extrato da conta.
 *
 * Desktop: tabela com Data · Descrição · Valor · Escopo · Estado · ação. A
 * contraparte fica em destaque e o tipo legível embaixo ("Pix enviado", não
 * `PIX_SENT`); o vínculo mora dentro do estado ("Conciliado · Conta #139");
 * escopo é texto, editável ao clicar. A coluna "Vínculo" que repetia "Sem
 * vínculo" e o `<select>` de escopo em cada linha saíram.
 *
 * Celular: cada movimentação é um cartão de duas linhas, e o cartão inteiro
 * é o botão que abre a revisão, onde escopo e conciliação são decididos.
 *
 * TanStack Table dá a ordenação por data e valor e deixa o modelo de colunas
 * pronto para a seleção em lote e a virtualização da fase de rotas, quando
 * este extrato passa a juntar todas as contas.
 */
export default function TabelaMovimentacoes({ linhas }: { linhas: LinhaMovimentacao[] }) {
  const [ordem, setOrdem] = useState<SortingState>([{ id: "data", desc: true }]);
  const [revisando, setRevisando] = useState<LinhaMovimentacao | null>(null);
  const fechar = useCallback(() => setRevisando(null), []);

  const colunas = useMemo<ColumnDef<LinhaMovimentacao>[]>(
    () => [
      {
        id: "data",
        header: "Data",
        accessorFn: (l) => l.occurredAt,
        cell: ({ row }) => (
          <time dateTime={row.original.occurredAt} className="flex flex-col leading-tight whitespace-nowrap">
            <span className="text-foreground">{formatDate(row.original.occurredAt)}</span>
            <span className="text-[12px] text-muted-foreground">{formatTime(row.original.occurredAt)}</span>
          </time>
        ),
      },
      {
        id: "descricao",
        header: "Descrição",
        enableSorting: false,
        cell: ({ row }) => {
          const l = row.original;
          return (
            <span className="flex min-w-0 flex-col">
              <strong className="truncate font-medium text-foreground" title={titulo(l)}>
                {titulo(l)}
                {l.counterpartySource === "COMPROVANTE" ? (
                  <span className="ml-1.5 text-[12px] font-normal text-muted-foreground">(comprovante)</span>
                ) : null}
              </strong>
              <span className="truncate text-[12px] text-muted-foreground" title={l.transactionType}>
                {rotuloTipoMovimentacao(l.transactionType)}
                {detalheExtra(l) ? ` · ${detalheExtra(l)}` : ""}
              </span>
            </span>
          );
        },
      },
      {
        id: "valor",
        header: "Valor",
        accessorFn: (l) => (l.direction === "CREDIT" ? 1 : -1) * Number(l.amount),
        cell: ({ row }) => <Valor linha={row.original} />,
      },
      {
        id: "escopo",
        header: "Escopo",
        enableSorting: false,
        cell: ({ row }) => (
          <EditorEscopo
            transactionId={row.original.id}
            scope={row.original.scope}
            scopeSource={row.original.scopeSource}
            category={row.original.category}
          />
        ),
      },
      {
        id: "estado",
        header: "Estado",
        enableSorting: false,
        cell: ({ row }) => <Estado linha={row.original} />,
      },
      {
        id: "acao",
        header: () => <span className="sr-only">Ações</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <Button type="button" variant="ghost" size="sm" onClick={() => setRevisando(row.original)}>
            Revisar
          </Button>
        ),
      },
    ],
    [],
  );

  // A tabela é o modelo de dados; `useReactTable` devolve funções que o React
  // Compiler não consegue memorizar, e isto é esperado aqui.
  // eslint-disable-next-line react-hooks/incompatible-library
  const tabela = useReactTable({
    data: linhas,
    columns: colunas,
    state: { sorting: ordem },
    onSortingChange: setOrdem,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (l) => l.id,
  });

  const LARGURA: Record<string, string> = {
    data: "w-[7.5rem]",
    descricao: "",
    valor: "w-[10rem] text-right",
    escopo: "w-[11rem]",
    estado: "w-[9.5rem]",
    acao: "w-[5.5rem] text-right",
  };

  return (
    <>
      {/* Desktop */}
      <table className="w-full table-fixed border-collapse text-sm max-[820px]:hidden" aria-label="Movimentações bancárias">
        <thead>
          {tabela.getHeaderGroups().map((grupo) => (
            <tr key={grupo.id} className="border-b border-border">
              {grupo.headers.map((h) => {
                const sentido = h.column.getIsSorted();
                return (
                  <th
                    key={h.id}
                    scope="col"
                    aria-sort={sentido === "asc" ? "ascending" : sentido === "desc" ? "descending" : undefined}
                    className={cn("h-10 px-3 text-left text-[13px] font-medium text-muted-foreground", LARGURA[h.id])}
                  >
                    {h.column.getCanSort() ? (
                      <button
                        type="button"
                        onClick={h.column.getToggleSortingHandler()}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                          h.id === "valor" && "flex-row-reverse",
                        )}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {sentido === "asc" ? (
                          <ArrowUp className="size-3.5" aria-hidden="true" />
                        ) : sentido === "desc" ? (
                          <ArrowDown className="size-3.5" aria-hidden="true" />
                        ) : null}
                      </button>
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {tabela.getRowModel().rows.map((linha) => (
            <tr key={linha.id} className="border-b border-border last:border-b-0 hover:bg-[color:var(--hover-bg)]">
              {linha.getVisibleCells().map((celula) => (
                <td key={celula.id} className={cn("px-3 py-2.5 align-middle", LARGURA[celula.column.id])}>
                  {flexRender(celula.column.columnDef.cell, celula.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Celular: o cartão inteiro abre a revisão. */}
      <ul className="m-0 list-none p-0 min-[821px]:hidden" aria-label="Movimentações bancárias">
        {tabela.getRowModel().rows.map(({ original: l }) => (
          <li key={l.id} className="border-b border-border last:border-b-0">
            <button
              type="button"
              onClick={() => setRevisando(l)}
              className="flex w-full min-w-0 items-center gap-3 px-1 py-3 text-left transition-transform duration-[60ms] active:scale-[0.985] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none"
              aria-label={`Revisar ${titulo(l)}, ${l.direction === "CREDIT" ? "entrada" : "saída"} de ${formatCurrency(l.amount, l.currency)}`}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-baseline justify-between gap-3">
                  <strong className="min-w-0 truncate text-[15px] font-semibold text-foreground">{titulo(l)}</strong>
                  <Valor linha={l} className="text-[15px]" />
                </span>
                <span className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
                  <span className="min-w-0 truncate">
                    {formatDate(l.occurredAt)} · {rotuloTipoMovimentacao(l.transactionType)}
                  </span>
                  <span className="shrink-0 whitespace-nowrap">
                    <span className={COR_ESCOPO[l.scope]}>{SCOPE_LABELS[l.scope as FinanceScope] ?? l.scope}</span>
                    {" · "}
                    {rotuloEstado(l.reconciliation?.status)}
                  </span>
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      {revisando ? <FolhaRevisao linha={revisando} aoFechar={fechar} /> : null}
    </>
  );
}
