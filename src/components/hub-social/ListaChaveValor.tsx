import type { ReactNode } from "react";
import BadgeStatus from "@/components/sistema/Status";
import { BotaoCopiar } from "@/components/hub-social/BotaoCopiar";

export { BotaoCopiar };

export type ItemChaveValor = {
  rotulo: string;
  valor: ReactNode | string | null | undefined;
  mono?: boolean;
  copiar?: string;
  href?: string;
  vazio?: string;
  status?: string;
};

export type ListaChaveValorProps = {
  itens: ItemChaveValor[];
  titulo?: string;
  descricao?: string;
  compacto?: boolean;
};

function ehExterno(href: string): boolean {
  return /^(https?:)?\/\//i.test(href) || /^(mailto|tel):/i.test(href);
}

function Valor({ item }: { item: ItemChaveValor }) {
  const vazio = item.valor === null || item.valor === undefined || item.valor === "";
  if (vazio) return <span className="kv-vazio">{item.vazio ?? "—"}</span>;

  const classe = item.mono ? "kv-valor mono" : "kv-valor";
  if (item.href) {
    const externo = ehExterno(item.href);
    return (
      <a
        href={item.href}
        target={externo ? "_blank" : undefined}
        rel={externo ? "noopener noreferrer" : undefined}
        className={`${classe} kv-link`}
      >
        {item.valor}
      </a>
    );
  }
  return <span className={classe}>{item.valor}</span>;
}

/**
 * Rótulo e valor, um por linha, numa superfície só — é o que mostra webhook,
 * token e id de conta nas telas de integração. Desde 18/09/2026 usa as classes
 * do sistema, as mesmas das listas do menu: sem contorno, separador fino e o
 * valor técnico em monoespaçada com botão de copiar ao lado.
 */
export default function ListaChaveValor({ itens, titulo, descricao, compacto = false }: ListaChaveValorProps) {
  return (
    <section className="grupo">
      {titulo || descricao ? (
        <header className="grupo-cabecalho">
          <div className="kv-titulo">
            {titulo ? <h2>{titulo}</h2> : null}
            {descricao ? <p>{descricao}</p> : null}
          </div>
        </header>
      ) : null}

      <dl className={compacto ? "grupo-superficie kv-lista compacta" : "grupo-superficie kv-lista"}>
        {itens.map((item, indice) => (
          <div className="kv-linha" key={`${item.rotulo}-${indice}`}>
            <dt>{item.rotulo}</dt>
            <dd>
              <Valor item={item} />
              {item.status ? <BadgeStatus status={item.status} /> : null}
              {item.copiar ? <BotaoCopiar texto={item.copiar} rotulo={`Copiar ${item.rotulo}`} /> : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
