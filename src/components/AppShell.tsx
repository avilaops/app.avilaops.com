import type { ReactNode } from "react";
import MarcaDaCasa from "@/components/MarcaDaCasa";
import MobileNav from "@/components/MobileNav";
import SideNav from "@/components/SideNav";
import ThemeToggle from "@/components/ThemeToggle";
import { identidadeDaCasa } from "@/lib/identidade-casa";
import type { SecaoApp } from "@/lib/navegacao";

type AppShellProps = {
  adminName: string;
  section: SecaoApp;
  children: ReactNode;
  /** OWNER ou ADMIN. Decide o que o menu oferece — a página confere de novo. */
  papel?: string;
};

/**
 * Moldura de toda tela logada. Desktop: coluna fixa à esquerda. Celular:
 * barra superior + barra de abas (`MobileNav`). Os dois existem no DOM e o
 * CSS mostra um de cada vez — assim a troca de largura não recarrega nada.
 */
export default async function AppShell({
  adminName,
  section,
  children,
  papel = "ADMIN",
}: AppShellProps) {
  const casa = await identidadeDaCasa();
  // A marca leva à configuração da empresa, que é do dono. Para a equipe o
  // destino continua sendo a operação: mandar para uma tela que redireciona de
  // volta seria um beco.
  const destinoDaMarca = papel === "OWNER" ? "/empresa" : "/operacao";

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <MarcaDaCasa
          nome={casa.nome}
          inicial={casa.inicial}
          iconeUrl={casa.iconeUrl}
          href={destinoDaMarca}
        />
        <ThemeToggle />
        <SideNav section={section} papel={papel} />

        <div className="sidebar-footer">
          <span className="status-dot" aria-hidden="true" />
          <div>
            <strong>{adminName.split(" ")[0]}</strong>
            <small>{papel === "OWNER" ? "Dono" : "Administrador"}</small>
          </div>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="text-button">
              Sair
            </button>
          </form>
        </div>
      </aside>

      <MobileNav
        section={section}
        adminName={adminName}
        papel={papel}
        casa={{ ...casa, href: destinoDaMarca }}
      />

      <main className="main-canvas">{children}</main>
    </div>
  );
}
