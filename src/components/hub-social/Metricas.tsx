import Link from "next/link";
import type { ReactNode } from "react";
import BotaoEvidencia from "@/components/hub-social/FolhaEvidencia";
import { Icone } from "@/components/ui/Icones";
import type { Evidencia } from "@/lib/evidencia";

export type GradeMetricasProps = {
  children: ReactNode;
  rotulo: string;
};

export type TomMetrica = "neutro" | "bom" | "atencao" | "ruim";

export type MetricaProps = {
  rotulo: string;
  valor: ReactNode;
  detalhe?: string;
  href?: string;
  tom?: TomMetrica;
  evidencia?: Evidencia;
  destaque?: boolean;
};

/**
 * Resumo numérico de uma tela do Hub Social.
 *
 * Desde 18/09/2026 é uma superfície só, dividida por separadores finos — no
 * celular uma linha por métrica, no desktop as colunas lado a lado. Antes eram
 * cartões independentes com borda, e o quarto número ficava órfão na segunda
 * fileira. As classes vêm do sistema (`docs/design-system.md`); não há mais
 * uma segunda linguagem visual aqui.
 */
export default function GradeMetricas({ children, rotulo }: GradeMetricasProps) {
  return (
    <section className="metricas" aria-label={rotulo}>
      {children}
    </section>
  );
}

export function Metrica({ rotulo, valor, detalhe, href, tom = "neutro", evidencia, destaque = false }: MetricaProps) {
  const conteudo = (
    <>
      <span className="metrica-rotulo">{rotulo}</span>
      <strong className={`metrica-valor tom-${tom}${destaque ? " destaque" : ""}`}>{valor}</strong>
      {detalhe ? <small className="metrica-detalhe">{detalhe}</small> : null}
    </>
  );

  if (href) {
    return (
      <div className="metrica">
        <Link href={href} className="metrica-alvo" aria-label={`Abrir ${rotulo}`}>
          {conteudo}
          <Icone nome="chevron" tamanho={16} className="chevron" />
        </Link>
        {evidencia ? (
          <span className="metrica-evidencia">
            <BotaoEvidencia evidencia={evidencia} rotulo={`Evidência de ${rotulo}`} />
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="metrica">
      <div className="metrica-alvo">{conteudo}</div>
      {evidencia ? (
        <span className="metrica-evidencia">
          <BotaoEvidencia evidencia={evidencia} rotulo={`Evidência de ${rotulo}`} />
        </span>
      ) : null}
    </div>
  );
}
