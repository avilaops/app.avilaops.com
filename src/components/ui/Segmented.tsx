"use client";

import { useRef, type KeyboardEvent } from "react";

type Props<T extends string> = {
  opcoes: ReadonlyArray<readonly [T, string]>;
  valor: T;
  aoMudar: (valor: T) => void;
  /** Nome do grupo para leitores de tela. */
  rotulo: string;
};

/**
 * Controle segmentado (o "UISegmentedControl"): dois ou três valores que se
 * excluem. Toque escolhe; setas, Home e End andam pelo grupo e o Tab entra e
 * sai por um único ponto (tabindex circulante), como manda o padrão de
 * radiogroup. Para mais de três opções, use um select.
 */
export default function Segmented<T extends string>({
  opcoes,
  valor,
  aoMudar,
  rotulo,
}: Props<T>) {
  const grupo = useRef<HTMLDivElement>(null);

  function aoTeclar(evento: KeyboardEvent<HTMLButtonElement>, indice: number) {
    let proximo = indice;
    switch (evento.key) {
      case "ArrowRight":
      case "ArrowDown":
        proximo = (indice + 1) % opcoes.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        proximo = (indice - 1 + opcoes.length) % opcoes.length;
        break;
      case "Home":
        proximo = 0;
        break;
      case "End":
        proximo = opcoes.length - 1;
        break;
      default:
        return;
    }
    evento.preventDefault();
    aoMudar(opcoes[proximo][0]);
    grupo.current
      ?.querySelectorAll<HTMLButtonElement>("button")
      [proximo]?.focus();
  }

  return (
    <div className="segmented" role="radiogroup" aria-label={rotulo} ref={grupo}>
      {opcoes.map(([codigo, texto], indice) => {
        const marcado = valor === codigo;
        return (
          <button
            type="button"
            role="radio"
            key={codigo}
            aria-checked={marcado}
            tabIndex={marcado ? 0 : -1}
            onClick={() => aoMudar(codigo)}
            onKeyDown={(evento) => aoTeclar(evento, indice)}
          >
            {texto}
          </button>
        );
      })}
    </div>
  );
}
