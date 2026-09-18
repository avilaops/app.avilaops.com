import { cn } from "@/lib/utils";
import { rotuloStatus, type TomStatus } from "@/lib/status-rotulos";

const classesPorTom: Record<TomStatus, string> = {
  bom: "text-[color:var(--green)] border-[color:var(--green-line)]",
  atencao: "text-[color:var(--amber)] border-[color:var(--amber-line)]",
  ruim: "text-[color:var(--red)] border-[color:var(--red-line)]",
  info: "text-[color:var(--blue)] border-[color:var(--blue-line)]",
  neutro: "text-muted-foreground border-border",
};

export type BadgeStatusProps = {
  status: string | null | undefined;
  texto?: string;
  tom?: TomStatus;
  titulo?: string;
};

export default function BadgeStatus({ status, texto, tom, titulo }: BadgeStatusProps) {
  const rotulo = rotuloStatus(status);
  const textoFinal = texto ?? rotulo.texto;
  const tomFinal = tom ?? rotulo.tom;
  const bruto = typeof status === "string" ? status.trim() : "";
  const title = titulo ?? (bruto && bruto !== textoFinal ? bruto : undefined);

  return (
    <span
      data-tom={tomFinal}
      title={title}
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full border bg-transparent px-2 text-[12px] font-medium leading-none whitespace-nowrap",
        classesPorTom[tomFinal],
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {textoFinal}
    </span>
  );
}
