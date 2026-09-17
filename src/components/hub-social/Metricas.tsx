import Link from "next/link";
import type { ReactNode } from "react";
import BotaoEvidencia from "@/components/hub-social/FolhaEvidencia";
import type { Evidencia } from "@/lib/evidencia";
import { cn } from "@/lib/utils";

export type GradeMetricasProps = {
  children: ReactNode;
  rotulo: string;
};

export type TomMetrica = "neutro" | "bom" | "atencao" | "ruim";

export type MetricaProps = {
  rotulo: string;
  valor: ReactNode;
  detalhe?: string;
  href?: string;
  tom?: TomMetrica;
  evidencia?: Evidencia;
  destaque?: boolean;
};

const corDoTom: Record<TomMetrica, string> = {
  neutro: "text-foreground",
  bom: "text-[color:var(--green)]",
  atencao: "text-[color:var(--amber)]",
  ruim: "text-[color:var(--red)]",
};

/**
 * Desktop: grade de cartões. Abaixo de 560px: um cartão só, uma linha por
 * métrica (inset grouped do iOS). O mesmo DOM serve às duas formas.
 */
export default function GradeMetricas({ children, rotulo }: GradeMetricasProps) {
  return (
    <section
      aria-label={rotulo}
      className={cn(
        "grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]",
        "max-[560px]:grid-cols-1 max-[560px]:gap-0 max-[560px]:overflow-hidden max-[560px]:rounded-2xl max-[560px]:border max-[560px]:border-border max-[560px]:bg-card",
      )}
    >
      {children}
    </section>
  );
}

/*
 * A divisória entre linhas fica no próprio filho (border-b + last:border-b-0)
 * em vez de divide-y no pai: divide-y e o border-0 do cartão disputam a mesma
 * propriedade e a ordem entre eles no CSS gerado não é garantida.
 */
const classesCartao = cn(
  "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 rounded-xl border border-border bg-card p-4 text-foreground no-underline",
  "max-[560px]:min-h-[52px] max-[560px]:grid-cols-[minmax(0,1fr)_auto_auto_auto] max-[560px]:items-center max-[560px]:rounded-none max-[560px]:border-x-0 max-[560px]:border-t-0 max-[560px]:last:border-b-0 max-[560px]:bg-transparent max-[560px]:px-4 max-[560px]:py-2",
);

const classesPressionar =
  "transition-transform duration-[60ms] hover:bg-accent motion-reduce:transition-none";

function Chevron({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("text-lg leading-none text-muted-foreground", className)}>
      ›
    </span>
  );
}

export function Metrica({ rotulo, valor, detalhe, href, tom = "neutro", evidencia, destaque = false }: MetricaProps) {
  const conteudo = (
    <>
      <span className="col-start-1 row-start-1 text-xs text-muted-foreground max-[560px]:text-[15px] max-[560px]:text-foreground">
        {rotulo}
      </span>
      <span
        className={cn(
          "col-start-1 row-start-2 font-mono font-semibold tabular-nums leading-tight",
          destaque ? "text-[28px]" : "text-2xl",
          "max-[560px]:col-start-2 max-[560px]:row-start-1 max-[560px]:row-span-2 max-[560px]:self-center max-[560px]:text-[17px]",
          corDoTom[tom],
        )}
      >
        {valor}
      </span>
      {detalhe ? (
        <span className="col-start-1 row-start-3 mt-1 text-xs text-muted-foreground max-[560px]:row-start-2 max-[560px]:mt-0">
          {detalhe}
        </span>
      ) : null}
    </>
  );

  const posicaoChevron = cn(
    evidencia ? "col-start-2 row-start-2 row-span-2" : "col-start-2 row-start-1 row-span-3",
    "self-center max-[560px]:col-start-4 max-[560px]:row-start-1 max-[560px]:row-span-2",
  );

  const botaoEvidencia = evidencia ? (
    <span className="relative z-10 col-start-2 row-start-1 -mt-2 -mr-2 justify-self-end self-start max-[560px]:col-start-3 max-[560px]:row-span-2 max-[560px]:m-0 max-[560px]:self-center">
      <BotaoEvidencia evidencia={evidencia} rotulo={`Evidência de ${rotulo}`} />
    </span>
  ) : null;

  if (href && evidencia) {
    return (
      <div
        className={cn(
          classesCartao,
          classesPressionar,
          "relative has-[a:active]:scale-[0.985] motion-reduce:has-[a:active]:scale-100 has-[a:focus-visible]:ring-[3px] has-[a:focus-visible]:ring-ring/50",
        )}
      >
        {conteudo}
        {botaoEvidencia}
        <Link
          href={href}
          aria-label={`Abrir ${rotulo}`}
          className={cn(posicaoChevron, "outline-none after:absolute after:inset-0 after:content-['']")}
        >
          <Chevron />
        </Link>
      </div>
    );
  }

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          classesCartao,
          classesPressionar,
          "outline-none active:scale-[0.985] motion-reduce:active:scale-100 focus-visible:ring-[3px] focus-visible:ring-ring/50",
        )}
      >
        {conteudo}
        <Chevron className={posicaoChevron} />
      </Link>
    );
  }

  return (
    <div className={classesCartao}>
      {conteudo}
      {botaoEvidencia}
    </div>
  );
}
