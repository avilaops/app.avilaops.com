"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as PointerEventReact,
  type ReactNode,
} from "react";
import { Icone } from "@/components/ui/Icones";

type SheetProps = {
  titulo: string;
  aoFechar: () => void;
  children: ReactNode;
  /** Botões fixos no rodapé — ficam visíveis mesmo com o corpo rolando. */
  rodape?: ReactNode;
};

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Arrasto além disto fecha; abaixo, volta ao lugar. */
const LIMIAR_ARRASTO_PX = 120;
/** Um puxão rápido fecha mesmo curto (px por ms). */
const LIMIAR_VELOCIDADE = 0.6;

/**
 * Folha que sobe do rodapé no celular e vira uma janela centralizada no
 * desktop. É o mesmo componente para menu, formulário e confirmação: a
 * pessoa aprende um gesto (arrastar/fechar) e ele vale para tudo.
 *
 * Quem monta decide quando existe: o componente não tem estado "fechado" —
 * desmontar é fechar. Isso garante formulário sempre limpo ao reabrir.
 *
 * Três cuidados que custaram bug em outras telas:
 * - O teclado do iPhone não encolhe a viewport de layout, só a visual. A
 *   folha se ancora na `visualViewport` para o rodapé com "Salvar" não ficar
 *   atrás do teclado.
 * - Tab fica preso dentro da folha, e o foco volta para quem abriu ao fechar.
 * - Arrastar a alça para baixo fecha; alça sem gesto engana.
 */
export default function Sheet({ titulo, aoFechar, children, rodape }: SheetProps) {
  const painel = useRef<HTMLDivElement>(null);
  const tituloId = useId();
  const inicioArrasto = useRef<{ y: number; t: number } | null>(null);
  const [arrasto, setArrasto] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const [area, setArea] = useState<{ top: number; height: number } | null>(null);

  // Foco: entra na folha, não sai por Tab, volta para quem abriu.
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    painel.current?.focus();

    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        evento.preventDefault();
        aoFechar();
        return;
      }
      if (evento.key !== "Tab" || !painel.current) return;

      const itens = Array.from(
        painel.current.querySelectorAll<HTMLElement>(FOCAVEIS),
      ).filter((el) => el.offsetParent !== null);
      if (itens.length === 0) {
        evento.preventDefault();
        painel.current.focus();
        return;
      }
      const primeiro = itens[0];
      const ultimo = itens[itens.length - 1];
      const ativo = document.activeElement;
      const dentro = ativo instanceof Node && painel.current.contains(ativo);

      if (evento.shiftKey && (ativo === primeiro || !dentro || ativo === painel.current)) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && (ativo === ultimo || !dentro)) {
        evento.preventDefault();
        primeiro.focus();
      }
    }

    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener("keydown", aoTeclar);
      anterior?.focus?.();
    };
  }, [aoFechar]);

  // Teclado aberto: a folha passa a caber na parte visível da tela.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    function medir() {
      if (!vv) return;
      const encolhido = window.innerHeight - vv.height > 80;
      setArea(encolhido ? { top: vv.offsetTop, height: vv.height } : null);
    }

    medir();
    vv.addEventListener("resize", medir);
    vv.addEventListener("scroll", medir);
    return () => {
      vv.removeEventListener("resize", medir);
      vv.removeEventListener("scroll", medir);
    };
  }, []);

  function aoPressionar(evento: PointerEventReact<HTMLDivElement>) {
    // No desktop a folha é janela; arrastar com o mouse seria surpresa.
    if (evento.pointerType === "mouse") return;
    inicioArrasto.current = { y: evento.clientY, t: performance.now() };
    setArrastando(true);
    evento.currentTarget.setPointerCapture(evento.pointerId);
  }

  function aoMover(evento: PointerEventReact<HTMLDivElement>) {
    if (!inicioArrasto.current) return;
    setArrasto(Math.max(0, evento.clientY - inicioArrasto.current.y));
  }

  function aoSoltar(evento: PointerEventReact<HTMLDivElement>) {
    const inicio = inicioArrasto.current;
    if (!inicio) return;
    inicioArrasto.current = null;
    setArrastando(false);

    const deslocamento = evento.clientY - inicio.y;
    const velocidade = deslocamento / Math.max(performance.now() - inicio.t, 1);
    if (deslocamento > LIMIAR_ARRASTO_PX || velocidade > LIMIAR_VELOCIDADE) {
      aoFechar();
      return;
    }
    setArrasto(0);
  }

  return (
    <div
      className="sheet-backdrop"
      role="presentation"
      onClick={aoFechar}
      style={area ? { top: area.top, height: area.height, bottom: "auto" } : undefined}
    >
      <div
        className={arrastando ? "sheet sheet-arrastando" : "sheet"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        ref={painel}
        onClick={(evento) => evento.stopPropagation()}
        style={arrasto ? { transform: `translateY(${arrasto}px)` } : undefined}
      >
        <div
          className="sheet-grip"
          onPointerDown={aoPressionar}
          onPointerMove={aoMover}
          onPointerUp={aoSoltar}
          onPointerCancel={aoSoltar}
        >
          <span className="sheet-handle" aria-hidden="true" />
          <header className="sheet-header">
            <h2 id={tituloId}>{titulo}</h2>
            <button
              type="button"
              className="sheet-close"
              onClick={aoFechar}
              aria-label="Fechar"
            >
              <Icone nome="fechar" tamanho={18} />
            </button>
          </header>
        </div>
        <div className="sheet-body">{children}</div>
        {rodape ? <footer className="sheet-footer">{rodape}</footer> : null}
      </div>
    </div>
  );
}
