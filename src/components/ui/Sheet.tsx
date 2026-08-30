"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Icone } from "@/components/ui/Icones";

type SheetProps = {
  titulo: string;
  aoFechar: () => void;
  children: ReactNode;
  /** Botões fixos no rodapé — ficam visíveis mesmo com o corpo rolando. */
  rodape?: ReactNode;
};

/**
 * Folha que sobe do rodapé no celular e vira uma janela centralizada no
 * desktop. É o mesmo componente para menu, formulário e confirmação: a
 * pessoa aprende um gesto (arrastar/fechar) e ele vale para tudo.
 *
 * Quem monta decide quando existe: o componente não tem estado "fechado" —
 * desmontar é fechar. Isso garante formulário sempre limpo ao reabrir.
 */
export default function Sheet({ titulo, aoFechar, children, rodape }: SheetProps) {
  const painel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    painel.current?.focus();

    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") aoFechar();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.body.style.overflow = anterior;
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aoFechar]);

  return (
    <div className="sheet-backdrop" role="presentation" onClick={aoFechar}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        ref={painel}
        onClick={(evento) => evento.stopPropagation()}
      >
        <span className="sheet-handle" aria-hidden="true" />
        <header className="sheet-header">
          <h2>{titulo}</h2>
          <button
            type="button"
            className="sheet-close"
            onClick={aoFechar}
            aria-label="Fechar"
          >
            <Icone nome="fechar" tamanho={18} />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {rodape ? <footer className="sheet-footer">{rodape}</footer> : null}
      </div>
    </div>
  );
}
