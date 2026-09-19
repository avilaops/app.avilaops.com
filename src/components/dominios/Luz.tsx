import { rotuloEstado, tomEstado } from "@/lib/dominios/capacidades";
import type { EstadoCapacidade } from "@/lib/dominios/tipos";
import { cn } from "@/lib/utils";

const COR: Record<ReturnType<typeof tomEstado>, string> = {
  bom: "bg-[color:var(--green)]",
  atencao: "bg-[color:var(--amber)]",
  ruim: "bg-[color:var(--red)]",
  neutro: "bg-[color:var(--texto-terciario)]",
};

/**
 * A luz de uma função: um ponto, sem texto ao lado.
 *
 * O texto vive no `aria-label` e no `title` porque a leitura rápida é o ponto
 * inteiro desta peça. Escrever "Conectado" em quatro linhas seguidas obriga a
 * ler quatro vezes para descobrir que está tudo igual; a cor responde de
 * relance, e quem quiser o motivo abre a linha.
 */
export default function Luz({ estado, className }: { estado: EstadoCapacidade; className?: string }) {
  const rotulo = rotuloEstado(estado);
  return (
    <span
      role="img"
      aria-label={rotulo}
      title={rotulo}
      className={cn("inline-block size-2 shrink-0 rounded-full", COR[tomEstado(estado)], className)}
    />
  );
}
