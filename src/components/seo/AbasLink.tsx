import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/components/shadcn/tabs";

/**
 * Abas de navegação do SEO: visual das Tabs do shadcn, mas cada gatilho é um
 * <Link> e o valor ativo vem da URL (searchParams). Não há estado local — o
 * mesmo padrão de MetaOperationsNav.
 */

export type AbaLink = { chave: string; href: string; label: string };

export default function AbasLink({ abas, ativa, rotulo }: { abas: AbaLink[]; ativa: string; rotulo: string }) {
  return (
    <Tabs value={ativa} className="w-full">
      <TabsList
        aria-label={rotulo}
        className="h-10 w-full justify-start max-[560px]:overflow-x-auto max-[560px]:[scrollbar-width:none] max-[560px]:[&::-webkit-scrollbar]:hidden min-[561px]:w-fit"
      >
        {abas.map((aba) => (
          <TabsTrigger
            key={aba.chave}
            value={aba.chave}
            asChild
            className="min-h-[34px] flex-none px-3 no-underline min-[561px]:px-4"
          >
            <Link href={aba.href} aria-current={aba.chave === ativa ? "page" : undefined}>
              {aba.label}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
