import Link from "next/link";
import { isValidElement, type ReactNode } from "react";
import { Button } from "@/components/shadcn/button";
import { cn } from "@/lib/utils";

export type AcaoEstadoVazio = { label: string; href: string };

export type EstadoVazioProps = {
  titulo: string;
  descricao?: string;
  /** Estado vazio sempre traz a ação que resolve; omitir é exceção, não padrão. */
  acao?: AcaoEstadoVazio | ReactNode;
  compacto?: boolean;
  icone?: ReactNode;
};

function ehLink(acao: EstadoVazioProps["acao"]): acao is AcaoEstadoVazio {
  return (
    typeof acao === "object" &&
    acao !== null &&
    !isValidElement(acao) &&
    "href" in acao &&
    typeof acao.href === "string"
  );
}

export default function EstadoVazio({ titulo, descricao, acao, compacto = false, icone }: EstadoVazioProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border text-center",
        compacto ? "gap-2 px-4 py-6" : "gap-3 px-6 py-12",
      )}
    >
      {icone ? (
        <div aria-hidden="true" className="text-muted-foreground [&_svg]:size-6">
          {icone}
        </div>
      ) : null}

      <p className={cn("font-semibold text-foreground", compacto ? "text-[15px]" : "text-[17px]")}>{titulo}</p>

      {descricao ? (
        <p className="max-w-[420px] text-sm leading-[1.5] text-muted-foreground">{descricao}</p>
      ) : null}

      {acao ? (
        <div className={cn("w-full max-w-[320px]", compacto ? "mt-1" : "mt-2")}>
          {ehLink(acao) ? (
            <Button
              asChild
              variant={compacto ? "outline" : "default"}
              className="min-h-11 w-full px-5 text-[15px] min-[821px]:min-h-10 min-[821px]:text-sm"
            >
              <Link href={acao.href}>{acao.label}</Link>
            </Button>
          ) : (
            acao
          )}
        </div>
      ) : null}
    </div>
  );
}
