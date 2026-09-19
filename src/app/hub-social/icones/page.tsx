import { redirect } from "next/navigation";
import CabecalhoPagina from "@/components/hub-social/CabecalhoPagina";
import DetalheIcones from "@/components/icones/DetalheIcones";
import VisaoGeralIcones from "@/components/icones/VisaoGeralIcones";
import type { Auditoria, ItemDominio, Params } from "@/components/icones/dados";
import { getAdmin } from "@/lib/auth";
import { PROVIDER_ICONES } from "@/lib/icones/auditoria";
import { prisma } from "@/lib/prisma";

export const metadata = {
  title: "Ícones | Hub Social",
  description: "O padrão de entrega de ícones e manifesto, conferido domínio a domínio.",
};

export default async function IconesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const params = await searchParams;
  const lidoEm = new Date().toISOString();

  const dominios = await prisma.domainAsset.findMany({
    where: { status: { not: "ARCHIVED" } },
    include: { organization: { select: { name: true } } },
    orderBy: [{ organization: { name: "asc" } }, { fqdn: "asc" }],
  });

  const conexoes = await prisma.integrationConnection.findMany({
    where: { provider: PROVIDER_ICONES },
    orderBy: { updatedAt: "desc" },
  });
  const porDominio = new Map(conexoes.map((c) => [c.siteUrl, c]));

  const itens: ItemDominio[] = dominios.map((dominio) => {
    const conexao = porDominio.get(dominio.fqdn) ?? null;
    return {
      fqdn: dominio.fqdn,
      organizacao: dominio.organization.name,
      auditoria: (conexao?.metadata as Auditoria | undefined) ?? undefined,
      conexao,
    };
  });

  const selecionado = itens.find((item) => item.fqdn === params.domain);
  if (selecionado) return <DetalheIcones item={selecionado} />;

  return (
    <>
      <CabecalhoPagina
        eyebrow="Hub Social"
        titulo="Ícones"
        subtitulo="Favicon, atalho do iPhone, manifesto e imagem de compartilhamento — o mesmo padrão em todo site que a casa entrega."
      />
      <VisaoGeralIcones itens={itens} lidoEm={lidoEm} />
    </>
  );
}
