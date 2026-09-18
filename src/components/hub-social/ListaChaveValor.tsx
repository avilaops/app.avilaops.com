import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
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
  if (vazio) {
    return <span className="text-muted-foreground">{item.vazio ?? "—"}</span>;
  }

  const classes = cn("min-w-0 break-all", item.mono && "font-mono text-[13px]");

  if (item.href) {
    const externo = ehExterno(item.href);
    return (
      <a
        href={item.href}
        target={externo ? "_blank" : undefined}
        rel={externo ? "noopener noreferrer" : undefined}
        className={cn(classes, "text-foreground underline decoration-border underline-offset-4 hover:decoration-current")}
      >
        {item.valor}
      </a>
    );
  }

  return <span className={classes}>{item.valor}</span>;
}

export default function ListaChaveValor({ itens, titulo, descricao, compacto = false }: ListaChaveValorProps) {
  const temCabecalho = Boolean(titulo || descricao);

  return (
    <section className="w-full min-w-0 overflow-hidden rounded-xl border border-border bg-card">
      {temCabecalho ? (
        <header className="border-b border-border px-4 pt-4 pb-3">
          {titulo ? <h2 className="text-[15px] font-semibold text-foreground">{titulo}</h2> : null}
          {descricao ? <p className="mt-0.5 text-[13px] text-muted-foreground">{descricao}</p> : null}
        </header>
      ) : null}

      <dl className="divide-y divide-border">
        {itens.map((item, indice) => (
          <div
            key={`${item.rotulo}-${indice}`}
            className={cn(
              "flex min-w-0 flex-col gap-1 px-4 min-[560px]:flex-row min-[560px]:items-start min-[560px]:gap-4",
              compacto ? "min-h-[44px] py-2" : "min-h-[52px] py-3",
            )}
          >
            <dt className="shrink-0 text-[13px] text-muted-foreground min-[560px]:w-[200px] min-[560px]:pt-[3px]">
              {item.rotulo}
            </dt>
            <dd className="flex min-w-0 flex-1 items-center gap-x-2 gap-y-1 text-[15px] text-foreground min-[560px]:text-[14px]">
              <span className="min-w-0 flex-1">
                <Valor item={item} />
              </span>
              {item.status ? <BadgeStatus status={item.status} /> : null}
              {item.copiar ? <BotaoCopiar texto={item.copiar} rotulo={`Copiar ${item.rotulo}`} /> : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
