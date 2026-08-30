import Link from "next/link";
import type { ReactNode } from "react";
import MobileNav from "@/components/MobileNav";
import SideNav from "@/components/SideNav";
import ThemeToggle from "@/components/ThemeToggle";
import type { SecaoApp } from "@/lib/navegacao";

type AppShellProps = {
  adminName: string;
  section: SecaoApp;
  children: ReactNode;
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
}: AppShellProps) {
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link href="/operacao" className="brand-lockup" aria-label="Ávila Ops">
          <span className="brand-mark">A</span>
          <strong>Ávila Ops</strong>
        </Link>
        <ThemeToggle />
        <SideNav section={section} />

        <div className="sidebar-footer">
          <span className="status-dot" aria-hidden="true" />
          <div>
            <strong>{adminName.split(" ")[0]}</strong>
            <small>Administrador</small>
          </div>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="text-button">
              Sair
            </button>
          </form>
        </div>
      </aside>

      <MobileNav section={section} adminName={adminName} />

      <main className="main-canvas">{children}</main>
    </div>
  );
}
