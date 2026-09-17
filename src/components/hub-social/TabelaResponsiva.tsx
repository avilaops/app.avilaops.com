import Link from "next/link";
import type { ReactNode } from "react";
import BotaoEvidencia from "@/components/hub-social/FolhaEvidencia";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shadcn/table";
import type { Evidencia } from "@/lib/evidencia";
import { cn } from "@/lib/utils";

/**
 * Tabela do Hub Social que vira cartão de andares no celular — a mesma técnica
 * de `TransactionList`: um DOM só, alternando por classes responsivas.
 *
 * - A partir de 821px: `<Table>` do shadcn, cabeçalho visível, números à
 *   direita em fonte monoespaçada.
 * - Até 820px: cada `<tr>` vira um cartão. A coluna `principal` ocupa o topo
 *   em destaque; as demais viram pares rótulo/valor numa grade de 2 colunas;
 *   a ação ocupa a largura total com 44px de altura.
 *
 * `href` torna a linha inteira clicável sem aninhar link e botão: o link fica
 * na célula principal e estende a área de toque com `::after` cobrindo a
 * linha; ação e evidência sobem com `relative z-10` (igual a `Metrica` com
 * href + evidencia em Metricas.tsx).
 *
 * Não tem "use client": serve a páginas de servidor. Os filhos interativos
 * (`BotaoEvidencia`, ações) são client components isolados.
 */

export type ColunaTabela = {
  chave: string;
  rotulo: string;
  alinhar?: "direita";
  mono?: boolean;
  principal?: boolean;
};

export type LinhaTabela = {
  id: string;
  celulas: Record<string, ReactNode>;
  href?: string;
  evidencia?: Evidencia;
  acao?: ReactNode;
};

export type TabelaResponsivaProps = {
  rotulo: string;
  colunas: ColunaTabela[];
  linhas: LinhaTabela[];
};

const CELULA_VAZIA = "—";

function vazia(valor: ReactNode) {
  return valor === null || valor === undefined || valor === "";
}

export default function TabelaResponsiva({ rotulo, colunas, linhas }: TabelaResponsivaProps) {
  const temFinal = linhas.some((linha) => linha.href || linha.evidencia || linha.acao);
  const chavePrincipal = colunas.find((coluna) => coluna.principal)?.chave ?? colunas[0]?.chave;

  return (
    <Table
      aria-label={rotulo}
      className="max-[820px]:block max-[820px]:text-[15px]"
    >
      <TableHeader className="max-[820px]:hidden">
        <TableRow className="hover:bg-transparent">
          {colunas.map((coluna) => (
            <TableHead
              key={coluna.chave}
              scope="col"
              className={cn(
                "h-10 px-3 text-[13px] font-medium text-muted-foreground",
                coluna.alinhar === "direita" && "text-right",
              )}
            >
              {coluna.rotulo}
            </TableHead>
          ))}
          {temFinal ? (
            <TableHead scope="col" className="w-px px-3">
              <span className="sr-only">Ações</span>
            </TableHead>
          ) : null}
        </TableRow>
      </TableHeader>

      <TableBody className="max-[820px]:flex max-[820px]:flex-col max-[820px]:gap-3 max-[820px]:[&_tr:last-child]:border">
        {linhas.map((linha) => {
          const temConteudoFinal = Boolean(linha.href || linha.evidencia || linha.acao);

          return (
            <TableRow
              key={linha.id}
              className={cn(
                linha.href &&
                  "relative has-[a:focus-visible]:ring-[3px] has-[a:focus-visible]:ring-ring/50 max-[820px]:has-[a:active]:scale-[0.985] max-[820px]:transition-transform max-[820px]:duration-[60ms] motion-reduce:transition-none motion-reduce:has-[a:active]:scale-100",
                "max-[820px]:grid max-[820px]:grid-cols-2 max-[820px]:gap-x-3 max-[820px]:gap-y-3 max-[820px]:rounded-2xl max-[820px]:border max-[820px]:border-border max-[820px]:bg-card max-[820px]:p-4",
              )}
            >
              {colunas.map((coluna) => {
                const valor = linha.celulas[coluna.chave];
                const principal = coluna.chave === chavePrincipal;
                const direita = coluna.alinhar === "direita";
                const conteudo = vazia(valor) ? (
                  <span className="text-muted-foreground">{CELULA_VAZIA}</span>
                ) : (
                  valor
                );

                return (
                  <TableCell
                    key={coluna.chave}
                    className={cn(
                      "px-3 py-3 text-foreground",
                      direita && "text-right",
                      (direita || coluna.mono) && "font-mono tabular-nums",
                      coluna.mono && "text-[13px]",
                      "max-[820px]:block max-[820px]:min-w-0 max-[820px]:p-0 max-[820px]:text-left max-[820px]:whitespace-normal max-[820px]:break-words",
                      principal &&
                        "font-medium max-[820px]:col-span-2 max-[820px]:font-sans max-[820px]:text-[17px] max-[820px]:font-semibold max-[820px]:leading-snug",
                    )}
                  >
                    {principal ? null : (
                      <span className="mb-0.5 block font-sans text-[13px] font-normal text-muted-foreground min-[821px]:hidden">
                        {coluna.rotulo}
                      </span>
                    )}
                    {principal && linha.href ? (
                      <Link
                        href={linha.href}
                        className="text-foreground no-underline outline-none after:absolute after:inset-0 after:content-['']"
                      >
                        {conteudo}
                      </Link>
                    ) : (
                      conteudo
                    )}
                  </TableCell>
                );
              })}

              {temFinal ? (
                <TableCell
                  className={cn(
                    "px-3 py-2 text-right",
                    "max-[820px]:col-span-2 max-[820px]:block max-[820px]:p-0",
                    !temConteudoFinal && "max-[820px]:hidden",
                  )}
                >
                  <div className="flex items-center justify-end gap-2">
                    {linha.acao ? (
                      <div className="relative z-10 max-[820px]:min-w-0 max-[820px]:flex-1 max-[820px]:[&_button]:min-h-11 max-[820px]:[&_button]:w-full">
                        {linha.acao}
                      </div>
                    ) : null}
                    {linha.evidencia ? (
                      <span className="relative z-10 max-[820px]:ml-auto">
                        <BotaoEvidencia evidencia={linha.evidencia} rotulo={`Evidência de ${linha.evidencia.rotulo}`} />
                      </span>
                    ) : null}
                    {linha.href ? (
                      <span aria-hidden="true" className="text-lg leading-none text-muted-foreground max-[820px]:hidden">
                        ›
                      </span>
                    ) : null}
                  </div>
                </TableCell>
              ) : null}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
