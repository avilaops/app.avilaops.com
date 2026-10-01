import Link from "next/link";
import MarcaAvila from "@/components/sistema/MarcaAvila";
import type { ReactNode } from "react";
import MobileNav from "@/components/MobileNav";
import SideNav from "@/components/SideNav";
import ThemeToggle from "@/components/ThemeToggle";
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
export default function AppShell({
  adminName,
  section,
  children,
  papel = "ADMIN",
}: AppShellProps) {
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link href="/operacao" className="brand-lockup" aria-label="Avila Ops">
          <MarcaAvila />
        </Link>
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

      <MobileNav section={section} adminName={adminName} papel={papel} />

      <main className="main-canvas">{children}</main>
    </div>
  );
}
