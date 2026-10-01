"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/** Valor com botão de esconder, para quando a tela está sendo mostrada a alguém. */
export default function ValorOcultavel({ valor, rotulo }: { valor: string; rotulo: string }) {
  const [visivel, setVisivel] = useState(true);
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-1.5">
      <span className="break-words">{visivel ? valor : "••••••"}</span>
      <button
        type="button"
        onClick={() => setVisivel((atual) => !atual)}
        aria-label={visivel ? `Ocultar ${rotulo.toLowerCase()}` : `Mostrar ${rotulo.toLowerCase()}`}
        aria-pressed={!visivel}
        className="grid size-11 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {visivel ? <Eye className="size-4" aria-hidden="true" /> : <EyeOff className="size-4" aria-hidden="true" />}
      </button>
    </span>
  );
}
