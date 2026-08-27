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

const navigation = [
  {
    label: "Operação",
    items: [
      {
        href: "/operacao",
        label: "Visão central",
        marker: "01",
        section: "operations",
      },
      {
        href: "/clientes",
        label: "Clientes e marcas",
        marker: "02",
        section: "clients",
      },
      {
        href: "/clientes/solicitacoes",
        label: "Solicitações de cadastro",
        marker: "03",
        section: "client-requests",
      },
      {
        href: "/projetos",
        label: "Entregas",
        marker: "04",
        section: "projects",
      },
      {
        href: "/operacao/seo",
        label: "SEO e integrações",
        marker: "05",
        section: "seo",
      },
      {
        href: "/operacao/google",
        label: "Google Command Center",
        marker: "06",
        section: "google-suite",
      },
      {
        href: "/operacao/obs",
        label: "Observabilidade OSB",
        marker: "07",
        section: "obs",
      },
      {
        href: "/operacao/meta",
        label: "Meta Business",
        marker: "08",
        section: "meta",
      },
      {
        href: "/operacao/whatsapp",
        label: "WhatsApp Business",
        marker: "09",
        section: "whatsapp",
      },
      {
        href: "/operacao/servicos",
        label: "Catálogo de serviços",
        marker: "10",
        section: "services",
      },
      {
        href: "/operacao/newsletter",
        label: "Newsletter",
        marker: "11",
        section: "newsletter",
      },
      {
        href: "/vagas",
        label: "Vagas e recrutamento",
        marker: "12",
        section: "jobs",
      },
    ],
  },
  {
    label: "Financeiro",
    items: [
      {
        href: "/financeiro",
        label: "Visão financeira",
        marker: "08",
        section: "overview",
      },
      {
        href: "/financeiro?status=PENDING",
        label: "Conciliação",
        marker: "09",
        section: "reconciliation",
      },
      {
        href: "/financeiro/contas",
        label: "Contas a pagar e receber",
        marker: "10",
        section: "ledger",
      },
      {
        href: "/financeiro?range=90",
        label: "Movimentações",
        marker: "11",
        section: "transactions",
      },
      {
        href: "/financeiro/importar",
        label: "Importar extrato",
        marker: "12",
        section: "import",
      },
      {
        href: "/financeiro/mercadopago",
        label: "Mercado Pago",
        marker: "13",
        section: "mercadopago",
      },
      {
        href: "/relatorios",
        label: "Relatórios",
        marker: "13",
        section: "reports",
      },
    ],
  },
  {
    label: "Estratégia",
    items: [
      {
        href: "/implantacao",
        label: "Implantação OpenAI",
        marker: "14",
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
          <span>
            <strong>Ávila Ops</strong>
            <small>Operating system</small>
          </span>
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
                    <span>{item.marker}</span>
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
