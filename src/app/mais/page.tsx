import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CabecalhoTela from "@/components/sistema/CabecalhoTela";
import { Grupo, LinhaLink } from "@/components/sistema/Lista";
import { getAdmin } from "@/lib/auth";
import { blocosDoMenu, tomDoGrupo } from "@/lib/navegacao";

export const dynamic = "force-dynamic";

/**
 * "Mais" como tela, não como folha com sanfonas.
 *
 * Cada bloco é uma superfície com várias linhas; tocar numa linha navega para
 * a tela do grupo (/mais/<slug>), que lista os destinos daquele assunto. É a
 * mesma ideia dos Ajustes do iPhone: um nível por vez, nunca a árvore inteira.
 */
export default async function MaisPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  const blocos = blocosDoMenu(admin.role);

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="menu">
      <CabecalhoTela titulo="Mais" descricao="Tudo o que não cabe nas quatro abas." />

      <div className="pilha">
        <Grupo>
          {/* A conta mora no SSO: é lá que estão senha, e-mails e logins vinculados. */}
          <LinhaLink
            href="https://auth.avilaops.com/conta"
            titulo={admin.nome}
            descricao={admin.role === "OWNER" ? "Dono da conta" : "Administrador"}
            icone="clientes"
            tom="azul"
          />
        </Grupo>

        {blocos.map((bloco) => (
          <Grupo titulo={bloco.titulo} key={bloco.titulo}>
            {bloco.grupos.map((grupo) => (
              <LinhaLink
                key={grupo.label}
                href={`/mais/${grupo.slug}`}
                titulo={grupo.label}
                descricao={grupo.descricao}
                icone={grupo.icone}
                tom={tomDoGrupo(grupo.slug)}
              />
            ))}
          </Grupo>
        ))}
      </div>
    </AppShell>
  );
}
