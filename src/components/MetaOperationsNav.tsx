import Link from "next/link";

const items = [
  { href: "/hub-social/meta", label: "Conexão" },
  { href: "/hub-social/meta/ativos", label: "Ativos" },
  { href: "/hub-social/meta/leads", label: "Lead Ads" },
  { href: "/hub-social/meta/campanhas", label: "Campanhas" },
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
          (active === "connection" && item.href === "/hub-social/meta") ||
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
