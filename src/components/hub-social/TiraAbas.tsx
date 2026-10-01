"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Casca rolante das abas. Elas não cabem na largura do iPhone, então a
 * tira rola na horizontal — e quem abre /hub-social/estudio nascia com a tira
 * no começo, com a aba ativa fora da tela. Aqui ela entra em quadro no primeiro
 * render, mexendo só no scroll da própria tira (nunca no da página).
 */
export default function TiraAbas({ className, children }: { className?: string; children: ReactNode }) {
  const tira = useRef<HTMLElement>(null);

  useEffect(() => {
    const elemento = tira.current;
    if (!elemento) return;

    const ativa = elemento.querySelector<HTMLElement>('[aria-current="page"]');
    if (!ativa) return;

    const sobra = elemento.scrollWidth - elemento.clientWidth;
    if (sobra <= 0) return; // no desktop a tira cabe inteira; nada a rolar

    const centro = ativa.offsetLeft - (elemento.clientWidth - ativa.offsetWidth) / 2;
    elemento.scrollLeft = Math.max(0, Math.min(centro, sobra));
  }, []);

  return (
    <nav ref={tira} aria-label="Canais do Hub Social" className={className}>
      {children}
    </nav>
  );
}
