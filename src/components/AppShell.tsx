import Link from "next/link";
import type { ReactNode } from "react";
import SideNav, { type SecaoApp } from "@/components/SideNav";
import ThemeToggle from "@/components/ThemeToggle";

type AppShellProps = {
  adminName: string;
  section: SecaoApp;
  children: ReactNode;
};

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
      <main className="main-canvas">{children}</main>
    </div>
  );
}
