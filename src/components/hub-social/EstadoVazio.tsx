import Link from "next/link";
import { isValidElement, type ReactNode } from "react";

export type AcaoEstadoVazio = { label: string; href: string };

export type EstadoVazioProps = {
  titulo: string;
  descricao?: string;
  /** Estado vazio sempre traz a ação que resolve; omitir é exceção, não padrão. */
  acao?: AcaoEstadoVazio | ReactNode;
  compacto?: boolean;
  icone?: ReactNode;
};

function ehLink(acao: EstadoVazioProps["acao"]): acao is AcaoEstadoVazio {
  return (
    typeof acao === "object" &&
    acao !== null &&
    !isValidElement(acao) &&
    "href" in acao &&
    typeof acao.href === "string"
  );
}

/**
 * Vazio na linguagem do sistema: superfície clara, sem borda tracejada, com
 * a ação que resolve. Uma implementação só para as sete telas do Hub Social —
 * as classes estão no globals.css, junto das outras do sistema.
 */
export default function EstadoVazio({ titulo, descricao, acao, compacto = false, icone }: EstadoVazioProps) {
  return (
    <div className={compacto ? "estado-vazio compacto" : "estado-vazio"}>
      {icone ? (
        <span className="estado-vazio-icone" aria-hidden="true">
          {icone}
        </span>
      ) : null}
      <strong>{titulo}</strong>
      {descricao ? <p>{descricao}</p> : null}
      {acao ? (
        <div className="estado-vazio-acao">
          {ehLink(acao) ? (
            <Link href={acao.href} className={compacto ? "secondary-button" : "primary-button"}>
              {acao.label}
            </Link>
          ) : (
            acao
          )}
        </div>
      ) : null}
    </div>
  );
}
