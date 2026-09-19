import Link from "next/link";
import TiraAbas from "@/components/hub-social/TiraAbas";
import { canaisHubSocial } from "@/lib/hub-social";

/**
 * As abas dos canais, numa linha só que rola na horizontal quando não
 * cabe. Desde 18/09/2026 usa as classes do sistema: cápsula clara, aba ativa
 * como peça branca — o mesmo gesto da barra de abas do celular.
 */
export default function AbasHubSocial({ ativo }: { ativo: string | null }) {
  return (
    <TiraAbas className="tira-abas">
      <ul className="abas-hub">
        {canaisHubSocial.map((canal) => {
          const atual = canal.chave === ativo;
          return (
            <li key={canal.chave}>
              <Link href={canal.href} aria-current={atual ? "page" : undefined} className="aba-hub">
                {canal.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </TiraAbas>
  );
}
