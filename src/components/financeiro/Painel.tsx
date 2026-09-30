import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Superfície de uma seção do Financeiro: título, ação opcional à direita e
 * o conteúdo. Substitui `section-panel`, `mp-painel`, `report-hero` e os
 * outros quatro jeitos de fazer a mesma caixa que cada página tinha.
 */
export default function Painel({
  titulo,
  descricao,
  acao,
  children,
  className,
  id,
}: {
  titulo?: string;
  descricao?: ReactNode;
  acao?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      aria-label={titulo}
      className={cn(
        "mb-4 min-w-0 rounded-xl bg-card p-4 shadow-[var(--sombra-1)] max-[820px]:p-3",
        className,
      )}
    >
      {titulo || acao ? (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            {titulo ? <h2 className="m-0 text-[15px] font-semibold text-foreground max-[820px]:text-[17px]">{titulo}</h2> : null}
            {descricao ? <p className="m-0 mt-0.5 text-[13px] text-muted-foreground">{descricao}</p> : null}
          </div>
          {acao ? <div className="min-w-0 max-[820px]:w-full">{acao}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
