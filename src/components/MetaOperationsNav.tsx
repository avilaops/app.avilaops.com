import Link from "next/link";

const items = [
  { href: "/operacao/meta", label: "Conexão" },
  { href: "/operacao/meta/ativos", label: "Ativos" },
  { href: "/operacao/meta/leads", label: "Lead Ads" },
  { href: "/operacao/meta/campanhas", label: "Campanhas" },
];

export default function MetaOperationsNav({
  active,
  organizationId,
}: {
  active: "connection" | "assets" | "leads" | "campaigns";
  organizationId?: string;
}) {
  return (
    <nav className="filter-strip" aria-label="Navegação Meta Business">
      {items.map((item) => {
        const url = new URLSearchParams();
        if (organizationId) url.set("organizationId", organizationId);
        const href = url.size ? `${item.href}?${url}` : item.href;
        const itemActive =
          (active === "connection" && item.href === "/operacao/meta") ||
          (active === "assets" && item.href.endsWith("/ativos")) ||
          (active === "leads" && item.href.endsWith("/leads")) ||
          (active === "campaigns" && item.href.endsWith("/campanhas"));

        return (
          <Link
            className={itemActive ? "filter-chip filter-chip-active" : "filter-chip"}
            href={href}
            key={item.href}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
