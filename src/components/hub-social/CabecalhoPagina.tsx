import type { ReactNode } from "react";
import CabecalhoTela from "@/components/sistema/CabecalhoTela";

export type CabecalhoPaginaProps = {
  eyebrow?: string;
  titulo: string;
  subtitulo?: string;
  acoes?: ReactNode;
  voltar?: { href: string; label: string };
  meta?: ReactNode;
};

/**
 * Cabeçalho das telas do Hub Social. Desde 18/09/2026 é o mesmo componente do
 * resto do app (`sistema/CabecalhoTela`): título forte, uma linha de
 * explicação, botão voltar circular e ações à direita. O `eyebrow` e o `meta`
 * continuam existindo porque o SEO usa os dois.
 */
export default function CabecalhoPagina({
  eyebrow,
  titulo,
  subtitulo,
  acoes,
  voltar,
  meta,
}: CabecalhoPaginaProps) {
  return (
    <>
      {eyebrow ? <p className="eyebrow-tela">{eyebrow}</p> : null}
      <CabecalhoTela
        titulo={titulo}
        descricao={subtitulo}
        voltar={voltar ? { href: voltar.href, rotulo: voltar.label } : undefined}
        acoes={
          meta || acoes ? (
            <>
              {meta ? <span className="cabecalho-meta">{meta}</span> : null}
              {acoes}
            </>
          ) : undefined
        }
      />
    </>
  );
}
