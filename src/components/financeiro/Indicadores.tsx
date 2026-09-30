import type { ReactNode } from "react";
import ValorOcultavel from "@/components/financeiro/ValorOcultavel";
import { cn } from "@/lib/utils";

export type TomIndicador = "neutro" | "entrada" | "saida" | "atencao";

const COR: Record<TomIndicador, string> = {
  neutro: "text-foreground",
  entrada: "text-[color:var(--green)]",
  saida: "text-[color:var(--red)]",
  atencao: "text-[color:var(--amber)]",
};

/**
 * Faixa de indicadores: quatro colunas no desktop, 2x2 no celular, numa
 * superfície só com fio entre as células.
 *
 * Antes era uma grade 2x2 também no desktop, com o fluxo líquido escondido
 * na legenda do cartão de saídas. O resultado é o número que responde "o
 * mês foi bom?", então ganhou célula própria.
 */
export function FaixaIndicadores({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <section
      aria-label={rotulo}
      className="mb-4 grid grid-cols-2 overflow-hidden rounded-xl bg-card shadow-[var(--sombra-1)] min-[1024px]:grid-cols-4 [&>*]:border-border max-[1023px]:[&>*:nth-child(odd)]:border-r max-[1023px]:[&>*:nth-child(-n+2)]:border-b min-[1024px]:[&>*:not(:last-child)]:border-r"
    >
      {children}
    </section>
  );
}

export function Indicador({
  rotulo,
  valor,
  detalhe,
  tom = "neutro",
  ocultavel = false,
}: {
  rotulo: string;
  valor: string;
  detalhe?: ReactNode;
  tom?: TomIndicador;
  /** Saldo pode ser escondido na tela (tela compartilhada, print). */
  ocultavel?: boolean;
}) {
  return (
    <div className="min-w-0 px-4 py-3.5 max-[820px]:px-3 max-[820px]:py-3">
      <span className="block text-[13px] text-muted-foreground">{rotulo}</span>
      <strong
        className={cn(
          "mt-1 block truncate font-mono text-[1.375rem] leading-tight font-semibold tabular-nums max-[820px]:text-base",
          COR[tom],
        )}
        title={valor}
      >
        {ocultavel ? <ValorOcultavel valor={valor} rotulo={rotulo} /> : valor}
      </strong>
      {detalhe ? (
        <small className="mt-1 block text-[12px] leading-snug text-muted-foreground">{detalhe}</small>
      ) : null}
    </div>
  );
}
