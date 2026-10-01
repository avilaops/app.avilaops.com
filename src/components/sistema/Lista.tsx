import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { Icone, type NomeIcone } from "@/components/ui/Icones";
import IconeNavegacao, { imagensNavegacao } from "@/components/sistema/IconeNavegacao";

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
    <span className={`icone-tile tom-${tom}${imagensNavegacao[nome] ? " icone-tile-3d" : ""}`} aria-hidden="true">
      <IconeNavegacao nome={nome} />
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

/**
 * Linha que navega. Um `<a>` de verdade: abre em nova aba, copia link, etc.
 * `aoClicar` existe para as telas em que o destino abre numa folha (o plano
 * do catálogo, por exemplo) — o href continua sendo o endereço real, e o
 * clique comum é interceptado.
 */
export function LinhaLink({
  href,
  aoClicar,
  ...props
}: LinhaProps & { href: string; aoClicar?: (evento: MouseEvent<HTMLAnchorElement>) => void }) {
  return (
    <Link
      href={href}
      onClick={aoClicar}
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

/**
 * Linha que age sem navegar: leva a um campo da mesma página, abre um editor.
 * Um `<button>` de verdade, para o teclado e o leitor de tela saberem que dá
 * para acionar — a `LinhaInfo` tem a mesma cara e não faz nada.
 */
export function LinhaBotao({
  aoClicar,
  ...props
}: LinhaProps & { aoClicar: () => void }) {
  return (
    <button type="button" className="linha linha-botao" onClick={aoClicar}>
      <Conteudo {...props} seta />
    </button>
  );
}

/**
 * Linha que abre no lugar, para o item que tem detalhe e não tem página.
 *
 * Existe porque a alternativa era empilhar seis pares de rótulo e valor dentro
 * de um cartão por item: no celular isso vira uma tela de rolagem para cada
 * linha da tabela, e quem está procurando uma coisa passa por tudo. Fechada,
 * a linha mostra o nome, um resumo e um valor — e o resto fica a um toque.
 *
 * `<details>` de verdade: abre sem JavaScript, o Ctrl+F do navegador acha o
 * conteúdo fechado, e o leitor de tela anuncia o estado sozinho.
 */
export function LinhaDobravel({
  children,
  ...props
}: LinhaProps & { children: ReactNode }) {
  return (
    <details className="linha-dobravel">
      <summary className="linha">
        <Conteudo {...props} seta />
      </summary>
      <div className="linha-dobra">{children}</div>
    </details>
  );
}
