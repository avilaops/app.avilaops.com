import Link from "next/link";
import TiraAbas from "@/components/hub-social/TiraAbas";
import { canaisHubSocial } from "@/lib/hub-social";
import { cn } from "@/lib/utils";

// Uma linha só, rolando na horizontal: sete abas quebravam em duas linhas no iPhone.
export default function AbasHubSocial({ ativo }: { ativo: string | null }) {
  return (
    <TiraAbas className="-mx-4 mb-5 overflow-x-auto px-4 [scrollbar-width:none] min-[821px]:mx-0 min-[821px]:px-0 [&::-webkit-scrollbar]:hidden">
      <ul className="m-0 flex w-max list-none gap-2 p-0 min-[821px]:w-fit min-[821px]:gap-1 min-[821px]:rounded-lg min-[821px]:bg-muted min-[821px]:p-[3px]">
        {canaisHubSocial.map((canal) => {
          const atual = canal.chave === ativo;
          return (
            <li key={canal.chave}>
              <Link
                href={canal.href}
                aria-current={atual ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center rounded-full px-4 text-[15px] font-medium whitespace-nowrap transition-transform duration-[60ms] active:scale-[0.985] motion-reduce:transition-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  "min-[821px]:h-8 min-[821px]:rounded-md min-[821px]:px-3 min-[821px]:text-sm",
                  atual
                    ? "bg-primary text-primary-foreground min-[821px]:bg-card min-[821px]:text-foreground min-[821px]:shadow-sm"
                    : "bg-muted text-foreground hover:bg-accent min-[821px]:bg-transparent min-[821px]:text-muted-foreground min-[821px]:hover:text-foreground",
                )}
              >
                {canal.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </TiraAbas>
  );
}
