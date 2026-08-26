// GERADO por packages/tema-noturno/sincronizar.mjs — não edite aqui.
// O canônico é packages/tema-noturno/src/. Edite lá e rode o script.
"use client";

/**
 * Ponte React do modo noturno. O núcleo (`./index`) não sabe o que é React —
 * aqui só entra o que precisa de re-render.
 *
 * ATENÇÃO: canônico em `packages/tema-noturno/src/react.tsx`. As cópias nos
 * apps saem de `node sincronizar.mjs`.
 */

import { useCallback, useEffect, useState } from "react";

import {
  alternar,
  iniciar,
  modoAtual,
  temaEfetivo,
  voltarAoAutomatico,
  type ModoTema,
  type Tema,
} from "./index";

export interface EstadoTema {
  tema: Tema;
  /** "auto" enquanto o relógio manda; "dark"/"light" quando há escolha manual válida. */
  modo: ModoTema;
  alternar: () => void;
  voltarAoAutomatico: () => void;
}

export function useTema(): EstadoTema {
  // O servidor não tem relógio do usuário. Começar em "light" e deixar o
  // script do <head> ter corrigido o DOM antes desta montagem evita que o
  // React pinte um estado que a tela já não mostra.
  const [tema, setTema] = useState<Tema>("light");
  const [modo, setModo] = useState<ModoTema>("auto");

  useEffect(() => {
    return iniciar({
      aoMudar: (temaNovo, modoNovo) => {
        setTema(temaNovo);
        setModo(modoNovo);
      },
    });
  }, []);

  const trocar = useCallback(() => {
    setTema(alternar());
    setModo(modoAtual());
  }, []);

  const soltar = useCallback(() => {
    setTema(voltarAoAutomatico());
    setModo("auto");
  }, []);

  return { tema, modo, alternar: trocar, voltarAoAutomatico: soltar };
}

export interface PropsBotaoTema {
  className?: string;
  /** Toque longo / clique com Alt volta ao automático sem precisar de outro botão. */
  permitirVoltarAoAutomatico?: boolean;
}

/**
 * Botão pronto, sem estilo próprio: quem decide a aparência é o CSS do app.
 * Um clique inverte o tema até a próxima virada; Alt+clique devolve ao relógio.
 */
export default function BotaoTema({
  className = "botao-tema",
  permitirVoltarAoAutomatico = true,
}: PropsBotaoTema) {
  const { tema, modo, alternar: trocar, voltarAoAutomatico: soltar } = useTema();

  const rotulo =
    modo === "auto"
      ? tema === "dark"
        ? "Tema escuro (automático até as 6h)"
        : "Tema claro (automático até as 18h)"
      : tema === "dark"
        ? "Tema escuro fixado até a próxima virada"
        : "Tema claro fixado até a próxima virada";

  return (
    <button
      aria-label={rotulo}
      className={className}
      data-modo={modo}
      onClick={(evento) => {
        if (permitirVoltarAoAutomatico && evento.altKey) soltar();
        else trocar();
      }}
      title={rotulo}
      type="button"
    >
      <span aria-hidden="true">{tema === "dark" ? "☼" : "☾"}</span>
    </button>
  );
}

export { temaEfetivo };
