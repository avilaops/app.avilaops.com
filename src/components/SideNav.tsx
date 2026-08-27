"use client";

import Link from "next/link";
import { useState } from "react";

export type SecaoApp =
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

type Item = { href: string; label: string; section: SecaoApp };

const navigation: { label: string; items: Item[] }[] = [
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

/**
 * São vinte destinos. No desktop eles cabem na coluna da esquerda; no celular
 * não cabem em lugar nenhum na horizontal — a faixa rolável escondia dois
 * terços do sistema atrás de um arrasto lateral que ninguém adivinha.
 *
 * Por isso o mesmo menu tem duas formas: coluna fixa acima de 820px, lista
 * vertical inteira atrás do botão "Menu" abaixo disso. A navegação recarrega a
 * página, então o estado aberto morre sozinho a cada escolha.
 */
export default function SideNav({ section }: { section: SecaoApp }) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <button
        type="button"
        className="nav-toggle"
        aria-expanded={aberto}
        aria-controls="navegacao-principal"
        onClick={() => setAberto((valor) => !valor)}
      >
        {aberto ? "Fechar" : "Menu"}
        <span aria-hidden="true">{aberto ? "✕" : "☰"}</span>
      </button>

      <nav
        id="navegacao-principal"
        className={aberto ? "side-nav side-nav-aberta" : "side-nav"}
        aria-label="Navegação principal"
      >
        {navigation.map((group) => (
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
                  onClick={() => setAberto(false)}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </>
  );
}
