"use client";

import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { Check, Copy, Info } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import { cn } from "@/lib/utils";
import { frescor, type Evidencia, type TomFrescor } from "@/lib/evidencia";

/**
 * "Detalhes da medição" do Hub Social: para qualquer número ou badge, diz de
 * onde o valor veio, quem calculou, quando foi lido e o dado bruto. Campo que
 * a evidência não trouxe aparece como "sem evidência registrada" — a linha
 * nunca some, porque a ausência também é informação para quem audita.
 */

const AUSENTE = "sem evidência registrada";

const formatoData = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" });

const classesPorTom: Record<TomFrescor, string> = {
  bom: "text-[color:var(--green)]",
  atencao: "text-[color:var(--amber)]",
  ruim: "text-[color:var(--red)]",
  neutro: "text-muted-foreground",
};

function formatarData(iso: string) {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? "data inválida" : formatoData.format(data);
}

function Ausente() {
  return <span className="text-muted-foreground italic">{AUSENTE}</span>;
}

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="grid min-h-[44px] grid-cols-[minmax(0,120px)_1fr] items-start gap-x-3 gap-y-1 border-b border-border py-2.5 last:border-b-0 max-[480px]:grid-cols-1">
      <dt className="pt-0.5 text-[13px] leading-5 text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0 text-[15px] leading-5 break-words">{children}</dd>
    </div>
  );
}

function Texto({ valor }: { valor: string | null | undefined }) {
  return valor ? <>{valor}</> : <Ausente />;
}

function Quando({ iso, agora }: { iso: string | null | undefined; agora: Date }) {
  if (!iso) return <Ausente />;
  const idade = frescor(iso, agora);
  return (
    <span className="flex flex-wrap items-baseline gap-x-2">
      <span>{formatarData(iso)}</span>
      <span className={cn("text-[13px] font-medium", classesPorTom[idade.tom])}>{idade.texto}</span>
    </span>
  );
}

function Referencia({ valor }: { valor: string | null | undefined }) {
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!copiado) return;
    const timer = window.setTimeout(() => setCopiado(false), 1_500);
    return () => window.clearTimeout(timer);
  }, [copiado]);

  if (!valor) return <Ausente />;
  const texto = valor;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      <code className="min-w-0 break-all font-mono text-[13px]">{valor}</code>
      <button
        type="button"
        onClick={copiar}
        aria-label={copiado ? "Referência copiada" : "Copiar referência"}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-transform active:scale-[0.985] hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {copiado ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      </button>
      <span aria-live="polite" className="sr-only">
        {copiado ? "Copiado" : ""}
      </span>
    </span>
  );
}

function Bruto({ valor }: { valor: unknown }) {
  if (valor === undefined) return <Ausente />;
  let json: string;
  try {
    json = JSON.stringify(valor, null, 2) ?? String(valor);
  } catch {
    json = String(valor);
  }
  return (
    <pre className="mt-2 max-h-[40vh] overflow-auto rounded-lg bg-muted p-3 font-mono text-[12px] leading-relaxed whitespace-pre">
      {json}
    </pre>
  );
}

export function FolhaEvidencia({
  evidencia,
  aberta,
  aoFechar,
}: {
  evidencia: Evidencia;
  aberta: boolean;
  aoFechar: () => void;
}) {
  // Montar só quando aberta: o relógio nasce zerado a cada abertura.
  if (!aberta) return null;
  return <FolhaAberta evidencia={evidencia} aoFechar={aoFechar} />;
}

function FolhaAberta({ evidencia, aoFechar }: { evidencia: Evidencia; aoFechar: () => void }) {
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setAgora(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <Sheet titulo="Detalhes da medição" aoFechar={aoFechar}>
      {/* Dentro de TabelaResponsiva a folha nasce numa TableCell e herda dela
          nowrap e alinhamento à direita: texto longo saía cortado e torto. */}
      <div className="whitespace-normal text-left">
      <p className="mb-3 text-[15px] font-medium leading-5">{evidencia.rotulo}</p>

      <dl className="m-0">
        <Linha rotulo="Origem"><Texto valor={evidencia.origem} /></Linha>
        <Linha rotulo="Função">
          {evidencia.funcao ? <code className="font-mono text-[13px] break-all">{evidencia.funcao}</code> : <Ausente />}
        </Linha>
        <Linha rotulo="Como foi calculado"><Texto valor={evidencia.formula} /></Linha>
        <Linha rotulo="Referência"><Referencia valor={evidencia.referencia} /></Linha>
        <Linha rotulo="Lido em"><Quando iso={evidencia.lidoEm} agora={agora} /></Linha>
        <Linha rotulo="Gravado em"><Quando iso={evidencia.gravadoEm} agora={agora} /></Linha>
        <Linha rotulo="Observação"><Texto valor={evidencia.observacao} /></Linha>
      </dl>

      <details className="mt-3 rounded-lg border border-border bg-card">
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center px-3 text-[15px] font-medium [&::-webkit-details-marker]:hidden">
          Dados brutos
        </summary>
        <div className="px-3 pb-3 text-[15px]">
          <Bruto valor={evidencia.bruto} />
        </div>
      </details>
      </div>
    </Sheet>
  );
}

export default function BotaoEvidencia({
  evidencia,
  rotulo,
  children,
}: {
  evidencia: Evidencia;
  rotulo?: string;
  children?: ReactNode;
}) {
  const [aberta, setAberta] = useState(false);
  const descricao = rotulo ?? `Detalhes de ${evidencia.rotulo}`;
  const fechar = useCallback(() => setAberta(false), []);

  function abrir(evento: MouseEvent<HTMLButtonElement>) {
    evento.preventDefault();
    evento.stopPropagation();
    setAberta(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        aria-label={descricao}
        aria-haspopup="dialog"
        aria-expanded={aberta}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-lg transition-transform active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          children ? "min-h-11 min-w-11" : "size-11 text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        {children ?? <Info size={16} aria-hidden="true" />}
      </button>
      <FolhaEvidencia evidencia={evidencia} aberta={aberta} aoFechar={fechar} />
    </>
  );
}
