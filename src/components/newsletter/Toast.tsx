"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

/**
 * Aviso de 2,8 s acima da barra de abas do celular (docs/auditoria-mobile-ios.md §5).
 * Some sozinho; quem monta escolhe o tom pela borda (verde = ok, vermelho = erro).
 */

const DURACAO_MS = 2_800;

export type TomToast = "ok" | "erro";

export default function Toast({ texto, tom, aoFechar }: { texto: string; tom: TomToast; aoFechar: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(aoFechar, DURACAO_MS);
    return () => window.clearTimeout(timer);
  }, [texto, tom, aoFechar]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed left-1/2 z-[60] w-[calc(100%-2rem)] max-w-[440px] -translate-x-1/2 rounded-xl border bg-card px-4 py-3 text-[15px] leading-5 text-foreground shadow-lg min-[821px]:text-sm",
        "bottom-[calc(var(--tab-bar-h)+env(safe-area-inset-bottom)+12px)] min-[821px]:bottom-6",
        tom === "ok" ? "border-[color:var(--green-line)]" : "border-[color:var(--red-line)]",
      )}
    >
      {texto}
    </div>
  );
}
