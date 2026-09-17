import Link from "next/link";
import type { ReactNode } from "react";
import { Icone, type NomeIcone } from "@/components/ui/Icones";
import { IconeTile, type TomIcone } from "@/components/sistema/Lista";

/**
 * Cabeçalho de tela: título forte, uma linha de explicação e as ações à
 * direita. `voltar` desenha o botão circular do padrão de app — no celular ele
 * é o caminho de volta ao menu, no desktop some, porque lá a coluna da
 * esquerda já diz onde você está.
 */
export default function CabecalhoTela({
  titulo,
  descricao,
  voltar,
  icone,
  tom,
  acoes,
}: {
  titulo: string;
  descricao?: string;
  voltar?: { href: string; rotulo: string };
  icone?: NomeIcone;
  tom?: TomIcone;
  acoes?: ReactNode;
}) {
  return (
    <header className="tela-cabecalho">
      {voltar ? (
        <Link href={voltar.href} className="botao-voltar" aria-label={voltar.rotulo}>
          <Icone nome="voltar" tamanho={18} />
        </Link>
      ) : null}
      {icone ? <IconeTile nome={icone} tom={tom} /> : null}
      <div className="tela-cabecalho-texto">
        <h1>{titulo}</h1>
        {descricao ? <p>{descricao}</p> : null}
      </div>
      {acoes ? <div className="tela-cabecalho-acoes">{acoes}</div> : null}
    </header>
  );
}
