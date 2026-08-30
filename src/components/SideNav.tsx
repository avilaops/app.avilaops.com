import Link from "next/link";
import { navegacaoDoPapel, type SecaoApp } from "@/lib/navegacao";

export type { SecaoApp };

/**
 * Coluna de navegação do desktop. No celular ela some inteira e quem assume é
 * o `MobileNav` (barra de abas + folha "Mais"); os dois leem o mesmo mapa em
 * `lib/navegacao.ts`.
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
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
