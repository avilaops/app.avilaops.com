import Link from "next/link";
import IconeNavegacao from "@/components/sistema/IconeNavegacao";
import { navegacaoDoPapel, tomDoGrupo, type SecaoApp } from "@/lib/navegacao";

export type { SecaoApp };

/**
 * Coluna do desktop. Mesma lista do celular (`lib/navegacao.ts`), desenhada
 * com a linguagem nova: sem caixa em volta, item aceso com superfície suave e
 * ícone na cor do grupo. No celular ela some e quem assume é o `MobileNav`.
 */
export default function SideNav({ section, papel }: { section: SecaoApp; papel: string }) {
  const grupos = navegacaoDoPapel(papel);
  return (
    <nav className="side-nav" aria-label="Navegação principal">
      {grupos.map((group) => (
        <div className="nav-group" key={group.label}>
          <span className="nav-eyebrow">{group.label}</span>
          {group.items.map((item) => {
            const ativo = item.section === section;
            return (
              <Link
                className={ativo ? "nav-link nav-link-active" : "nav-link"}
                href={item.href}
                key={item.href}
                aria-current={ativo ? "page" : undefined}
              >
                {item.icone ? (
                  <span className={`nav-icone tom-${tomDoGrupo(group.slug)}`} aria-hidden="true">
                    <IconeNavegacao nome={item.icone} tamanho={28} />
                  </span>
                ) : null}
                <span className="nav-link-label">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
