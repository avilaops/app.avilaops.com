import { notFound, redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CabecalhoTela from "@/components/sistema/CabecalhoTela";
import { Grupo, LinhaLink } from "@/components/sistema/Lista";
import { getAdmin } from "@/lib/auth";
import { grupoPorSlug, tomDoGrupo } from "@/lib/navegacao";

export const dynamic = "force-dynamic";

/** Um grupo do menu: as telas daquele assunto, uma por linha. */
export default async function GrupoDoMenuPage({ params }: { params: Promise<{ grupo: string }> }) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  const { grupo: slug } = await params;
  const grupo = grupoPorSlug(admin.role, slug);
  if (!grupo) notFound();
  const tom = tomDoGrupo(grupo.slug);

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="menu">
      <CabecalhoTela
        titulo={grupo.label}
        descricao={grupo.descricao}
        icone={grupo.icone}
        tom={tom}
        voltar={{ href: "/mais", rotulo: "Voltar para Mais" }}
      />

      <div className="pilha">
        <Grupo>
          {grupo.items.map((item) => (
            <LinhaLink
              key={item.href}
              href={item.href}
              titulo={item.label}
              descricao={item.descricao}
              icone={item.icone}
              tom={tom}
            />
          ))}
        </Grupo>
      </div>
    </AppShell>
  );
}
