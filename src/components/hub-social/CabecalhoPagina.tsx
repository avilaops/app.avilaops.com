import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type CabecalhoPaginaProps = {
  eyebrow?: string;
  titulo: string;
  subtitulo?: string;
  acoes?: ReactNode;
  voltar?: { href: string; label: string };
  meta?: ReactNode;
};

export default function CabecalhoPagina({
  eyebrow,
  titulo,
  subtitulo,
  acoes,
  voltar,
  meta,
}: CabecalhoPaginaProps) {
  const temLadoDireito = Boolean(acoes || meta);

  return (
    <header className="mb-6 flex flex-col gap-4 min-[560px]:flex-row min-[560px]:items-end min-[560px]:justify-between min-[560px]:gap-6">
      <div className="min-w-0">
        {voltar ? (
          <Link
            href={voltar.href}
            className="-ml-1 inline-flex min-h-11 items-center gap-1 px-1 text-[15px] text-primary min-[821px]:text-sm"
          >
            <span aria-hidden="true">‹</span>
            {voltar.label}
          </Link>
        ) : null}

        {eyebrow ? (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}

        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground min-[821px]:text-[22px]">
          {titulo}
        </h1>

        {subtitulo ? (
          <p className="mt-1 max-w-[620px] text-[15px] leading-[1.5] text-muted-foreground min-[821px]:text-sm">
            {subtitulo}
          </p>
        ) : null}
      </div>

      {temLadoDireito ? (
        <div className="flex shrink-0 flex-col gap-3 min-[560px]:items-end">
          {meta ? <div className="text-xs text-muted-foreground">{meta}</div> : null}
          {acoes ? (
            <div
              className={cn(
                "flex flex-wrap items-center gap-2",
                "max-[560px]:grid max-[560px]:grid-cols-2 max-[560px]:*:min-h-[50px] max-[560px]:*:w-full max-[560px]:[&>:only-child]:col-span-2",
              )}
            >
              {acoes}
            </div>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
