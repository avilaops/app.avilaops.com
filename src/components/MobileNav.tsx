"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import { Icone } from "@/components/ui/Icones";
import Sheet from "@/components/ui/Sheet";
import { abasDoPapel, navegacaoDoPapel, type SecaoApp } from "@/lib/navegacao";

/**
 * Navegação do celular, no padrão de app do iPhone: barra superior enxuta
 * (marca + tema), barra de abas fixa no rodapé com os quatro destinos de todo
 * dia e uma folha "Mais" com o sistema inteiro, o nome de quem está logado e
 * o "Sair".
 *
 * Tudo aqui só aparece abaixo de 820px — o CSS esconde no desktop.
 */
export default function MobileNav({
  section,
  adminName,
  papel,
}: {
  section: SecaoApp;
  adminName: string;
  papel: string;
}) {
  const [aberto, setAberto] = useState(false);
  const fechar = useCallback(() => setAberto(false), []);

  const abas = abasDoPapel(papel);
  const grupos = navegacaoDoPapel(papel);
  const abaAtiva = abas.find((aba) => aba.secoes.includes(section));
  const maisAtivo = aberto || !abaAtiva;
  const iniciais = adminName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <>
      <header className="mobile-topbar">
        <Link href="/operacao" className="brand-lockup" aria-label="Ávila Ops">
          <span className="brand-mark">A</span>
          <strong>Ávila Ops</strong>
        </Link>
        <ThemeToggle className="theme-toggle topbar-theme" />
      </header>

      <nav className="tab-bar" aria-label="Abas principais">
        {abas.map((aba) => {
          const ativo = abaAtiva?.href === aba.href;
          return (
            <Link
              href={aba.href}
              key={aba.href}
              className={ativo ? "tab-item tab-item-active" : "tab-item"}
              aria-current={ativo ? "page" : undefined}
            >
              <Icone nome={aba.icone} tamanho={24} />
              <span>{aba.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          className={maisAtivo ? "tab-item tab-item-active" : "tab-item"}
          onClick={() => setAberto(true)}
          aria-haspopup="dialog"
          aria-expanded={aberto}
        >
          <Icone nome="mais" tamanho={24} />
          <span>Mais</span>
        </button>
      </nav>

      {aberto ? (
        <Sheet titulo="Menu" aoFechar={fechar}>
          <div className="sheet-user">
            <span className="brand-mark" aria-hidden="true">
              {iniciais || "A"}
            </span>
            <div>
              <strong>{adminName}</strong>
              <small>Administrador</small>
            </div>
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="secondary-button">
                Sair
              </button>
            </form>
          </div>

          {grupos.map((grupo) => (
            <section className="sheet-group" key={grupo.label}>
              <h3 className="sheet-group-title">{grupo.label}</h3>
              <div className="ios-list">
                {grupo.items.map((item) => {
                  const ativo = item.section === section;
                  return (
                    <Link
                      href={item.href}
                      key={item.href}
                      className={ativo ? "ios-row ios-row-active" : "ios-row"}
                      aria-current={ativo ? "page" : undefined}
                      onClick={fechar}
                    >
                      <span className="ios-row-label">{item.label}</span>
                      <Icone nome="chevron" tamanho={16} className="chevron" />
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </Sheet>
      ) : null}
    </>
  );
}
