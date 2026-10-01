"use client";

import Link from "next/link";
import MarcaAvila from "@/components/sistema/MarcaAvila";
import IconeNavegacao from "@/components/sistema/IconeNavegacao";
import ThemeToggle from "@/components/ThemeToggle";
import { abasDoPapel, type SecaoApp } from "@/lib/navegacao";

/**
 * Navegação do celular: barra superior enxuta (marca + tema) e uma barra de
 * abas flutuante em cápsula, afastada das bordas, sem linha atravessando a
 * tela. O item aceso é uma peça dentro da cápsula, não um ícone colorido
 * solto.
 *
 * "Mais" deixou de abrir folha com sanfonas: agora é a tela /mais, que navega
 * por níveis (grupo → destino). Um nível por vez cabe no polegar e no
 * histórico do navegador — o gesto de voltar do iPhone funciona.
 *
 * Tudo aqui só aparece abaixo de 820px; o CSS esconde no desktop.
 */
export default function MobileNav({
  section,
  papel,
}: {
  section: SecaoApp;
  adminName?: string;
  papel: string;
}) {
  const abas = abasDoPapel(papel);
  const abaAtiva = abas.find((aba) => aba.secoes.includes(section));
  // Toda tela que não tem aba própria mora no "Mais" — inclusive as telas de menu.
  const maisAtivo = !abaAtiva;

  return (
    <>
      <header className="mobile-topbar">
        <Link href="/operacao" className="brand-lockup" aria-label="Avila Ops">
          <MarcaAvila />
        </Link>
        <ThemeToggle className="theme-toggle topbar-theme" />
      </header>

      <nav className="tab-bar" aria-label="Abas principais">
        <div className="tab-capsula">
          {abas.map((aba) => {
            const ativo = abaAtiva?.href === aba.href;
            return (
              <Link
                href={aba.href}
                key={aba.href}
                className={ativo ? "tab-item tab-item-active" : "tab-item"}
                aria-current={ativo ? "page" : undefined}
              >
                <IconeNavegacao nome={aba.icone} tamanho={30} />
                <span>{aba.label}</span>
              </Link>
            );
          })}
          <Link
            href="/mais"
            className={maisAtivo ? "tab-item tab-item-active" : "tab-item"}
            aria-current={maisAtivo ? "page" : undefined}
          >
            <IconeNavegacao nome="mais" tamanho={30} />
            <span>Mais</span>
          </Link>
        </div>
      </nav>
    </>
  );
}
