import Link from "next/link";
import { canaisHubSocial } from "@/lib/hub-social";

export default function AbasHubSocial({ ativo }: { ativo: string | null }) {
  return (
    <nav className="filter-strip hub-social-abas" aria-label="Canais do Hub Social">
      {canaisHubSocial.map((canal) => {
        const atual = canal.chave === ativo;
        return (
          <Link
            key={canal.chave}
            href={canal.href}
            className={atual ? "filter-chip filter-chip-active" : "filter-chip"}
            aria-current={atual ? "page" : undefined}
          >
            {canal.label}
          </Link>
        );
      })}
    </nav>
  );
}
