"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

type Resultado = "copiado" | "falhou" | null;

export type BotaoCopiarProps = { texto: string; rotulo?: string };

export function BotaoCopiar({ texto, rotulo }: BotaoCopiarProps) {
  const [resultado, setResultado] = useState<Resultado>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, []);

  async function copiar() {
    let proximo: Resultado = "copiado";
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      proximo = "falhou";
    }
    setResultado(proximo);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setResultado(null), 2000);
  }

  const Icone = resultado === "copiado" ? Check : Copy;
  const aviso = resultado === "copiado" ? "Copiado" : resultado === "falhou" ? "Não copiado" : "";

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={copiar}
        aria-label={rotulo ?? "Copiar"}
        className={cn(
          "inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition-colors",
          "hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.985]",
          resultado === "copiado" && "text-[color:var(--green)]",
          resultado === "falhou" && "text-[color:var(--red)]",
        )}
      >
        <Icone aria-hidden="true" size={16} />
      </button>
      <span
        aria-live="polite"
        className={cn(
          "text-[12px] font-medium",
          resultado === "copiado" && "text-[color:var(--green)]",
          resultado === "falhou" && "text-[color:var(--red)]",
          !resultado && "sr-only",
        )}
      >
        {aviso}
      </span>
    </span>
  );
}
