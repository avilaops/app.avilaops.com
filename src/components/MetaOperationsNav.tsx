import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/components/shadcn/tabs";

/**
 * Sub-abas das quatro rotas da Meta (Conexão, Ativos, Lead Ads, Campanhas).
 * São Tabs do shadcn em modo de navegação: cada gatilho é um <Link>, o valor
 * ativo vem da página (não há estado de cliente) e a query `organizationId`
 * é preservada em todos os hrefs para o filtro por cliente não se perder.
 */

type AbaMeta = "connection" | "assets" | "leads" | "campaigns";

const abas: { chave: AbaMeta; href: string; label: string }[] = [
  { chave: "connection", href: "/hub-social/meta", label: "Conexão" },
  { chave: "assets", href: "/hub-social/meta/ativos", label: "Ativos" },
  { chave: "leads", href: "/hub-social/meta/leads", label: "Lead Ads" },
  { chave: "campaigns", href: "/hub-social/meta/campanhas", label: "Campanhas" },
];

export default function MetaOperationsNav({
  active,
  organizationId,
}: {
  active: AbaMeta;
  organizationId?: string;
}) {
  return (
    <Tabs value={active} className="w-full">
      <TabsList
        aria-label="Navegação Meta Business"
        className="h-10 w-full justify-start max-[560px]:overflow-x-auto max-[560px]:[scrollbar-width:none] max-[560px]:[&::-webkit-scrollbar]:hidden min-[561px]:w-fit"
      >
        {abas.map((aba) => {
          const query = new URLSearchParams();
          if (organizationId) query.set("organizationId", organizationId);
          const href = query.size ? `${aba.href}?${query}` : aba.href;
          const atual = aba.chave === active;

          return (
            <TabsTrigger
              key={aba.chave}
              value={aba.chave}
              asChild
              className="min-h-[34px] flex-none px-3 no-underline min-[561px]:px-4"
            >
              <Link href={href} aria-current={atual ? "page" : undefined}>
                {aba.label}
              </Link>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
