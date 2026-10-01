import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export type GravidadeAviso = "erro" | "atencao" | "ok";

const ESTILO: Record<GravidadeAviso, string> = {
  erro: "border-[color:var(--red-line)] [&_[data-icone]]:text-[color:var(--red)]",
  atencao: "border-[color:var(--amber-line)] [&_[data-icone]]:text-[color:var(--amber)]",
  ok: "border-[color:var(--green-line)] [&_[data-icone]]:text-[color:var(--green)]",
};

const ICONE = { erro: CircleAlert, atencao: TriangleAlert, ok: CircleCheck };

/**
 * Aviso dentro de uma seção: ícone na cor da gravidade, título e detalhe em
 * cor de texto normal. O texto inteiro colorido de vermelho ou âmbar lia mal
 * no tema escuro, e o cartão sem `min-width: 0` cortava pela direita no
 * celular, com o identificador técnico sem quebrar.
 */
export default function Aviso({
  gravidade,
  titulo,
  children,
  compacto = false,
}: {
  gravidade: GravidadeAviso;
  titulo: string;
  children?: ReactNode;
  compacto?: boolean;
}) {
  const Icone = ICONE[gravidade];
  return (
    <div
      role={gravidade === "erro" ? "alert" : undefined}
      className={cn(
        "flex min-w-0 gap-2.5 rounded-lg border bg-card text-[13px] leading-snug",
        compacto ? "px-2.5 py-2" : "px-3 py-2.5",
        ESTILO[gravidade],
      )}
    >
      <Icone data-icone="" aria-hidden="true" className="mt-px size-4 shrink-0" />
      <div className="min-w-0 [overflow-wrap:anywhere]">
        <strong className="block font-semibold text-foreground">{titulo}</strong>
        {children ? <div className="mt-0.5 text-muted-foreground">{children}</div> : null}
      </div>
    </div>
  );
}
