"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { cn } from "@/lib/utils";

/**
 * Faixa que rola na horizontal e avisa que rola: a borda esmaece do lado em
 * que ainda há conteúdo. No celular as abas cortavam em "Conc" e "A
 * classificar ·" sem nenhum sinal de que havia mais à direita.
 */
export function RolagemHorizontal({ children, className }: { children: ReactNode; className?: string }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [bordas, setBordas] = useState({ esquerda: false, direita: false });

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () =>
      setBordas({
        esquerda: el.scrollLeft > 2,
        direita: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
      });
    medir();
    el.addEventListener("scroll", medir, { passive: true });
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => {
      el.removeEventListener("scroll", medir);
      observador.disconnect();
    };
  }, []);

  const mascara =
    bordas.esquerda && bordas.direita
      ? "[mask-image:linear-gradient(to_right,transparent,black_24px,black_calc(100%-24px),transparent)]"
      : bordas.direita
        ? "[mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)]"
        : bordas.esquerda
          ? "[mask-image:linear-gradient(to_right,transparent,black_24px)]"
          : "";

  return (
    <div
      ref={caixa}
      className={cn("min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", mascara, className)}
    >
      {children}
    </div>
  );
}

export type Aba = { href: string; rotulo: string; contagem?: number; ativa: boolean };

/** Abas de navegação por link (o filtro mora na URL, que dá para favoritar). */
export function AbasLink({ abas, rotulo }: { abas: Aba[]; rotulo: string }) {
  return (
    <RolagemHorizontal>
      <nav aria-label={rotulo} className="inline-flex gap-1 rounded-lg bg-[color:var(--surface-soft)] p-1">
        {abas.map((aba) => (
          <Link
            key={aba.href}
            href={aba.href}
            scroll={false}
            aria-current={aba.ativa ? "page" : undefined}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
              aba.ativa && "bg-card text-foreground shadow-[var(--sombra-1)]",
            )}
          >
            {aba.rotulo}
            {aba.contagem ? (
              <span className="rounded-full bg-[color:var(--line)] px-1.5 text-[11px] leading-[18px] text-foreground tabular-nums">
                {aba.contagem.toLocaleString("pt-BR")}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>
    </RolagemHorizontal>
  );
}

/** Filtro compacto por select: navega ao trocar, mantendo o resto da URL. */
export function FiltroSelect({
  rotulo,
  valor,
  opcoes,
}: {
  rotulo: string;
  valor: string;
  opcoes: Array<{ valor: string; rotulo: string; href: string }>;
}) {
  const router = useRouter();
  return (
    <Select
      value={valor}
      onValueChange={(proximo) => {
        const alvo = opcoes.find((o) => o.valor === proximo);
        if (alvo) router.push(alvo.href, { scroll: false });
      }}
    >
      <SelectTrigger aria-label={rotulo} className="min-h-9 w-auto min-w-40 bg-card max-[820px]:min-h-11 max-[820px]:flex-1">
        <span className="text-muted-foreground">{rotulo}:</span>
        {/* O rótulo vem daqui, não do item: fechado e antes de hidratar, o
            Select do Radix não tem de onde ler o texto e mostrava vazio. */}
        <SelectValue>{opcoes.find((o) => o.valor === valor)?.rotulo}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {opcoes.map((o) => (
          <SelectItem key={o.valor} value={o.valor}>
            {o.rotulo}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
