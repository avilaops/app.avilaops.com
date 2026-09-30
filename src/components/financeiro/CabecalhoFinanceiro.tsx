import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import AcoesCabecalho from "@/components/financeiro/AcoesCabecalho";
import { ACOES_DO_MODULO, type AcaoCabecalho } from "@/components/financeiro/acoes";

/**
 * Cabeçalho de toda página do Financeiro.
 *
 * O `CabecalhoTela` do sistema põe título e ações na mesma linha flexível, e
 * no Financeiro, com três botões largos, o subtítulo ficava com ~200px e
 * quebrava palavra por palavra. Aqui o texto tem largura mínima de 20rem:
 * quando não cabe junto das ações, as ações descem para a linha de baixo em
 * vez de espremer o texto.
 *
 * No celular: título e subtítulo; a seta só aparece quando há para onde
 * voltar (a visão geral tem aba própria no rodapé, então não tem seta); as
 * ações viram um botão primário mais o menu "Mais ações".
 */
export default function CabecalhoFinanceiro({
  titulo,
  descricao,
  voltar,
  acoes = ACOES_DO_MODULO,
  extras,
}: {
  titulo: string;
  descricao?: string;
  voltar?: { href: string; rotulo: string };
  acoes?: AcaoCabecalho[];
  /**
   * Controles próprios da página que já existem como componente com estado
   * (o registro de score do Crédito, por exemplo). Ficam antes das ações do
   * módulo e, no celular, numa linha própria.
   */
  extras?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-start gap-x-6 gap-y-3 max-[820px]:mb-4">
      <div className="flex min-w-0 flex-[1_1_20rem] items-start gap-3">
        {voltar ? (
          <Link
            href={voltar.href}
            aria-label={voltar.rotulo}
            className="botao-voltar mt-0.5 min-[821px]:hidden"
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </Link>
        ) : null}
        <div className="min-w-0">
          <h1 className="m-0 text-[1.75rem] leading-tight font-bold tracking-[-0.03em] text-foreground max-[820px]:text-[1.625rem]">
            {titulo}
          </h1>
          {descricao ? (
            <p className="mt-1 mb-0 max-w-[60ch] text-[0.9375rem] text-pretty text-muted-foreground max-[820px]:text-sm">
              {descricao}
            </p>
          ) : null}
        </div>
      </div>
      {extras || acoes.length ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 max-[820px]:w-full max-[820px]:[&>*]:flex-1">
          {extras}
          {acoes.length ? <AcoesCabecalho acoes={acoes} /> : null}
        </div>
      ) : null}
    </header>
  );
}
