"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/shadcn/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/popover";
import { nomeCurtoDaConta, rotuloInstituicao } from "@/lib/financeiro-rotulos";

export type ContaDoSeletor = {
  id: string;
  provider: string;
  displayName: string;
  currency: string;
  environment: string;
};

/**
 * Escolha da conta, agrupada por instituição.
 *
 * Eram dez nomes soltos em duas linhas de texto, com o selo "PRODUÇÃO"
 * misturado entre eles e a conta escolhida quase indistinguível das outras;
 * no celular a fila cortava no meio ("Cartao Assai | (") sem sinal de que
 * rolava. Agora é um botão só, que diz qual conta está aberta, e a lista
 * abre com busca. Ambiente só aparece quando não é produção: é a exceção que
 * merece aviso, não a regra.
 */
export default function SeletorConta({
  contas,
  atual,
  hrefDe,
}: {
  contas: ContaDoSeletor[];
  atual: ContaDoSeletor | null;
  /** Monta o endereço da página com a conta trocada, mantendo os filtros. */
  hrefDe: Record<string, string>;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);

  const grupos = new Map<string, ContaDoSeletor[]>();
  for (const conta of contas) {
    const lista = grupos.get(conta.provider) ?? [];
    lista.push(conta);
    grupos.set(conta.provider, lista);
  }

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={aberto}
          aria-label="Escolher conta"
          className="h-auto min-h-11 w-full min-w-0 justify-between gap-3 bg-card px-3 py-1.5 text-left min-[821px]:w-auto min-[821px]:min-w-72"
        >
          <span className="flex min-w-0 flex-col">
            <span className="text-[12px] leading-tight font-normal text-muted-foreground">
              {atual ? rotuloInstituicao(atual.provider) : "Conta"}
            </span>
            <span className="truncate text-sm leading-tight font-semibold">
              {atual ? nomeCurtoDaConta(atual.displayName, atual.provider) : "Nenhuma conta"}
              {atual && atual.environment !== "production" ? (
                <span className="ml-2 rounded-sm bg-[color:var(--amber-line)] px-1.5 py-0.5 text-[11px] font-medium text-[color:var(--amber)]">
                  {atual.environment === "sandbox" ? "Sandbox" : atual.environment}
                </span>
              ) : null}
            </span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <Command>
          <CommandInput placeholder="Buscar conta" />
          <CommandList className="max-h-[min(60vh,24rem)]">
            <CommandEmpty>Nenhuma conta com esse nome.</CommandEmpty>
            {[...grupos.entries()].map(([provider, lista]) => (
              <CommandGroup key={provider} heading={rotuloInstituicao(provider)}>
                {lista.map((conta) => (
                  <CommandItem
                    key={conta.id}
                    value={`${rotuloInstituicao(provider)} ${conta.displayName} ${conta.currency}`}
                    className="min-h-10"
                    onSelect={() => {
                      setAberto(false);
                      router.push(hrefDe[conta.id]);
                    }}
                  >
                    <Check
                      aria-hidden="true"
                      className={conta.id === atual?.id ? "size-4 text-[color:var(--accent)]" : "size-4 opacity-0"}
                    />
                    <span className="min-w-0 flex-1 truncate">{nomeCurtoDaConta(conta.displayName, provider)}</span>
                    <span className="text-[12px] text-muted-foreground">{conta.currency}</span>
                    {conta.environment !== "production" ? (
                      <span className="text-[11px] text-[color:var(--amber)]">
                        {conta.environment === "sandbox" ? "Sandbox" : conta.environment}
                      </span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
