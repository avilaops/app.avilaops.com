import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CabecalhoTela from "@/components/sistema/CabecalhoTela";
import { Grupo, LinhaInfo, LinhaLink } from "@/components/sistema/Lista";
import IdentidadeDaCasaForm from "@/app/empresa/IdentidadeDaCasaForm";
import { ehDono, getAdmin } from "@/lib/auth";
import { formatShortDate } from "@/lib/format";
import { identidadeDaCasa } from "@/lib/identidade-casa";

export const dynamic = "force-dynamic";
export const metadata = { title: "Empresa - Ávila Ops" };

/**
 * A configuração da própria Ávila Ops, aberta pelo ícone azul do topo.
 *
 * O caminho é o do pedido: toca-se na marca e chega-se no que é da casa. Não
 * confundir com a conta PESSOAL, que fica no SSO (auth.avilaops.com) — lá é
 * senha, e-mails e foto de quem usa; aqui é a empresa.
 */
export default async function EmpresaPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  // Marca e segredo são do dono: a equipe opera o resto.
  if (!ehDono(admin.role)) redirect("/mais");

  const identidade = await identidadeDaCasa();

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="menu">
      <CabecalhoTela
        titulo="Empresa"
        descricao="A identidade da casa e os segredos que ela usa."
        voltar={{ href: "/mais", rotulo: "Voltar para Mais" }}
      />

      <div className="pilha">
        <IdentidadeDaCasaForm
          nome={identidade.nome}
          inicial={identidade.inicial}
          iconeUrl={identidade.iconeUrl}
        />

        <Grupo titulo="Segredos">
          <LinhaLink
            href="/empresa/credenciais"
            titulo="Credenciais"
            descricao="Tokens e chaves das integrações, guardados cifrados"
            icone="config"
            tom="amarelo"
          />
        </Grupo>

        <Grupo titulo="Conta pessoal">
          <LinhaLink
            href="https://auth.avilaops.com/conta"
            titulo={admin.nome}
            descricao="Senha, e-mails e foto de perfil ficam no login da Ávila Ops"
            icone="clientes"
            tom="azul"
          />
          {identidade.atualizadoEm ? (
            <LinhaInfo
              titulo="Identidade atualizada"
              descricao={formatShortDate(identidade.atualizadoEm)}
              icone="casa"
              tom="neutro"
            />
          ) : null}
        </Grupo>
      </div>
    </AppShell>
  );
}
