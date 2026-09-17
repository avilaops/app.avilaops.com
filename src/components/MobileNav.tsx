"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import { Icone } from "@/components/ui/Icones";
import Sheet from "@/components/ui/Sheet";
import {
  abasDoPapel,
  grupoInicialAberto,
  navegacaoDoPapel,
  type SecaoApp,
} from "@/lib/navegacao";

/**
 * Navegação do celular, no padrão de app do iPhone: barra superior enxuta
 * (marca + tema), barra de abas fixa no rodapé com os quatro destinos de todo
 * dia e uma folha "Mais" com o sistema inteiro, o nome de quem está logado e
 * o "Sair".
 *
 * Os grupos da folha dobram. Em lista plana são 27 itens, quase três telas de
 * rolagem até o Financeiro; dobrados, o menu inteiro cabe numa tela. A troca é
 * rolagem por toque, e ela só se paga porque o grupo certo abre sozinho —
 * `grupoInicialAberto` explica a regra. Navegar dentro do grupo em que você já
 * está continua custando os mesmos dois toques.
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
  // A tela atual saiu da folha (SEO, Meta, Vagas...): o "Mais" fica aceso
  // porque é ali que ela mora. Aceso é "você está aqui", não "há um menu".
  const maisAtivo = !abaAtiva;

  // Qual grupo nasce aberto. O estado é derivado da seção, não guardado: a
  // folha desmonta a cada navegação, então na próxima abertura a regra vale de
  // novo, já com a tela nova. Nada para sincronizar nem invalidar.
  const [expandido, setExpandido] = useState<string | null>(() =>
    grupoInicialAberto(grupos, section, Boolean(abaAtiva)),
  );
  const alternarGrupo = useCallback((rotulo: string) => {
    setExpandido((atual) => (atual === rotulo ? null : rotulo));
  }, []);
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
              {/* O mesmo rótulo da coluna do desktop: o dono não é "Administrador". */}
              <small>{papel === "OWNER" ? "Dono" : "Administrador"}</small>
            </div>
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="secondary-button">
                Sair
              </button>
            </form>
          </div>

          {grupos.map((grupo) => {
            const abertoAqui = expandido === grupo.label;
            const idLista = `grupo-${grupo.label.toLowerCase().replace(/\s+/g, "-")}`;
            return (
              <section className="sheet-group" key={grupo.label}>
                <button
                  type="button"
                  className={abertoAqui ? "sheet-group-toggle aberto" : "sheet-group-toggle"}
                  aria-expanded={abertoAqui}
                  aria-controls={idLista}
                  onClick={() => alternarGrupo(grupo.label)}
                >
                  <span className="sheet-group-title">{grupo.label}</span>
                  <span className="sheet-group-count">{grupo.items.length}</span>
                  <Icone nome="chevron" tamanho={16} className="chevron" />
                </button>

                {/* Grupo fechado não renderiza item nenhum: some da folha e do
                    Tab de uma vez só, sem depender do filtro de visibilidade
                    que o focus trap da Sheet faz. */}
                {abertoAqui ? (
                  <div className="ios-list" id={idLista}>
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
                ) : null}
              </section>
            );
          })}
        </Sheet>
      ) : null}
    </>
  );
}
