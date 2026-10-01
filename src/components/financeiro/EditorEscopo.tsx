"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/popover";
import { FINANCE_SCOPES, SCOPE_LABELS, type FinanceScope } from "@/lib/finance-escopo";
import { cn } from "@/lib/utils";
import { useEscopo } from "@/components/financeiro/useEscopo";

export const COR_ESCOPO: Record<string, string> = {
  EMPRESA: "text-[color:var(--blue)]",
  PESSOAL: "text-foreground",
  INTERNO: "text-muted-foreground",
  INDEFINIDO: "text-[color:var(--amber)]",
};

/**
 * Escopo e categoria como texto, editável ao clicar.
 *
 * Era um `<select>` em toda linha: oitenta controles de formulário numa
 * tabela, cada um brigando pela atenção com o valor. Agora a linha só diz o
 * que é ("Empresa · Infraestrutura"), e a troca abre ao clicar.
 */
export default function EditorEscopo({
  transactionId,
  scope,
  scopeSource,
  category,
}: {
  transactionId: string;
  scope: string;
  scopeSource: string | null;
  category: string | null;
}) {
  const [aberto, setAberto] = useState(false);
  const { escopo, salvando, mudar } = useEscopo(transactionId, scope);
  const rotulo = SCOPE_LABELS[escopo as FinanceScope] ?? escopo;

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={salvando}
          className="-mx-1.5 flex max-w-full min-w-0 flex-col items-start rounded-md px-1.5 py-1 text-left hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          aria-label={`Escopo: ${rotulo}. Alterar`}
        >
          <span className={cn("text-[13px] font-medium", COR_ESCOPO[escopo])}>
            {rotulo}
            {scopeSource === "REGRA" && escopo !== "INDEFINIDO" ? (
              <span className="ml-1 font-normal text-muted-foreground" title="Classificado por regra automática. Confirme se estiver errado.">
                (regra)
              </span>
            ) : null}
          </span>
          {category ? <span className="max-w-full truncate text-[12px] text-muted-foreground">{category}</span> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-1">
        <div role="listbox" aria-label="Escopo da movimentação">
          {FINANCE_SCOPES.map((opcao) => (
            <button
              key={opcao}
              type="button"
              role="option"
              aria-selected={opcao === escopo}
              onClick={() => {
                setAberto(false);
                void mudar(opcao);
              }}
              className="flex min-h-9 w-full items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              <Check aria-hidden="true" className={cn("size-4", opcao === escopo ? "text-[color:var(--accent)]" : "opacity-0")} />
              {SCOPE_LABELS[opcao]}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
