import Link from "next/link";
import type { ReactNode } from "react";
import ThemeToggle from "@/components/ThemeToggle";

type AppShellProps = {
  adminName: string;
  section:
    | "operations"
    | "clients"
    | "client-requests"
    | "projects"
    | "overview"
    | "reconciliation"
    | "transactions"
    | "ledger"
    | "import"
    | "mercadopago"
    | "reports"
    | "seo"
    | "obs"
    | "meta"
    | "whatsapp"
    | "services"
    | "newsletter"
    | "jobs"
    | "partner-network"
    | "google-suite";
  children: ReactNode;
};

/*
 * Rótulo curto e sem numeração. O número na frente de cada item não dizia nada
 * — só empurrava o nome para a direita e, no celular, cortava o texto.
 */
const navigation = [
  {
    label: "Operação",
    items: [
      { href: "/operacao", label: "Visão central", section: "operations" },
      { href: "/clientes", label: "Clientes", section: "clients" },
      {
        href: "/clientes/solicitacoes",
        label: "Solicitações",
        section: "client-requests",
      },
      { href: "/projetos", label: "Entregas", section: "projects" },
      { href: "/operacao/seo", label: "SEO", section: "seo" },
      { href: "/operacao/google", label: "Google", section: "google-suite" },
      { href: "/operacao/obs", label: "Observabilidade", section: "obs" },
      { href: "/operacao/meta", label: "Meta", section: "meta" },
      { href: "/operacao/whatsapp", label: "WhatsApp", section: "whatsapp" },
      { href: "/operacao/servicos", label: "Serviços", section: "services" },
      {
        href: "/operacao/newsletter",
        label: "Newsletter",
        section: "newsletter",
      },
      { href: "/vagas", label: "Vagas", section: "jobs" },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { href: "/financeiro", label: "Visão geral", section: "overview" },
      {
        href: "/financeiro?status=PENDING",
        label: "Conciliação",
        section: "reconciliation",
      },
      {
        href: "/financeiro/contas",
        label: "Contas a pagar e receber",
        section: "ledger",
      },
      {
        href: "/financeiro?range=90",
        label: "Movimentações",
        section: "transactions",
      },
      {
        href: "/financeiro/importar",
        label: "Importar extrato",
        section: "import",
      },
      {
        href: "/financeiro/mercadopago",
        label: "Mercado Pago",
        section: "mercadopago",
      },
      { href: "/relatorios", label: "Relatórios", section: "reports" },
    ],
  },
  {
    label: "Estratégia",
    items: [
      {
        href: "/implantacao",
        label: "Implantação OpenAI",
        section: "partner-network",
      },
    ],
  },
];

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

        <nav className="side-nav" aria-label="Navegação principal">
          {navigation.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-eyebrow">{group.label}</span>
              {group.items.map((item) => {
                const active = section === item.section;
                return (
                  <Link
                    className={active ? "nav-link nav-link-active" : "nav-link"}
                    href={item.href}
                    key={item.href}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

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
