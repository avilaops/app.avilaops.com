import Link from "next/link";
import type { ReactNode } from "react";
import { Icone, type NomeIcone } from "@/components/ui/Icones";

/**
 * Lista agrupada: uma superfície branca contendo várias linhas, separadas por
 * um fio quase invisível. É o padrão dos Ajustes do iPhone e o que substitui
 * os cartões independentes que o painel usava para cada item.
 *
 * A profundidade vem do contraste entre o fundo da página e a superfície, não
 * de borda grossa nem sombra.
 */
export function Grupo({
  titulo,
  children,
  acao,
}: {
  titulo?: string;
  children: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <section className="grupo">
      {titulo || acao ? (
        <header className="grupo-cabecalho">
          {titulo ? <h2>{titulo}</h2> : <span />}
          {acao}
        </header>
      ) : null}
      <div className="grupo-superficie">{children}</div>
    </section>
  );
}

/** Cor do quadradinho do ícone. Azul é o padrão; as outras marcam contexto. */
export type TomIcone = "azul" | "vermelho" | "amarelo" | "neutro";

export function IconeTile({ nome, tom = "azul" }: { nome: NomeIcone; tom?: TomIcone }) {
  return (
    <span className={`icone-tile tom-${tom}`} aria-hidden="true">
      <Icone nome={nome} tamanho={18} />
    </span>
  );
}

type LinhaProps = {
  titulo: string;
  descricao?: string;
  icone?: NomeIcone;
  tom?: TomIcone;
  /** Texto curto à direita, antes do chevron (status, contagem, valor). */
  valor?: ReactNode;
  ativo?: boolean;
};

function Conteudo({ titulo, descricao, icone, tom, valor, seta }: LinhaProps & { seta: boolean }) {
  return (
    <>
      {icone ? <IconeTile nome={icone} tom={tom} /> : null}
      <span className="linha-texto">
        <strong>{titulo}</strong>
        {descricao ? <small>{descricao}</small> : null}
      </span>
      {valor ? <span className="linha-valor">{valor}</span> : null}
      {seta ? <Icone nome="chevron" tamanho={16} className="chevron" /> : null}
    </>
  );
}

/** Linha que navega. Um `<a>` de verdade: abre em nova aba, copia link, etc. */
export function LinhaLink({ href, ...props }: LinhaProps & { href: string }) {
  return (
    <Link
      href={href}
      className={props.ativo ? "linha linha-ativa" : "linha"}
      aria-current={props.ativo ? "page" : undefined}
    >
      <Conteudo {...props} seta />
    </Link>
  );
}

/** Linha só de leitura (rótulo e valor), sem destino. */
export function LinhaInfo(props: LinhaProps) {
  return (
    <div className="linha linha-estatica">
      <Conteudo {...props} seta={false} />
    </div>
  );
}
