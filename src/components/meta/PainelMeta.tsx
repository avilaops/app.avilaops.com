import type { ReactNode } from "react";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shadcn/card";

/**
 * Seção com título e descrição que envolve uma tabela (ou o estado vazio) nas
 * sub-rotas da Meta. No desktop é um Card; abaixo de 820px o Card some e fica
 * só o título de grupo, para os cartões de andares da TabelaResponsiva não
 * virarem "cartão dentro de cartão".
 */
export default function PainelMeta({
  id,
  titulo,
  descricao,
  acao,
  children,
}: {
  id?: string;
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
  children: ReactNode;
}) {
  const idTitulo = id ? `${id}-titulo` : undefined;

  return (
    <section id={id} aria-labelledby={idTitulo} className="scroll-mt-4">
      <Card className="gap-4 py-5 shadow-none max-[820px]:gap-3 max-[820px]:rounded-none max-[820px]:border-0 max-[820px]:bg-transparent max-[820px]:py-0">
        <CardHeader className="px-5 max-[820px]:px-1">
          <CardTitle id={idTitulo} className="text-[17px] leading-snug min-[821px]:text-[15px]">
            <h2>{titulo}</h2>
          </CardTitle>
          {descricao ? (
            <CardDescription className="text-[13px] leading-[1.5]">{descricao}</CardDescription>
          ) : null}
          {acao ? <CardAction>{acao}</CardAction> : null}
        </CardHeader>
        <CardContent className="px-2 max-[820px]:px-0">{children}</CardContent>
      </Card>
    </section>
  );
}
