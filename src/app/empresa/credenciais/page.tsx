import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CabecalhoTela from "@/components/sistema/CabecalhoTela";
import { Grupo, LinhaLink } from "@/components/sistema/Lista";
import { ehDono, getAdmin } from "@/lib/auth";
import { listarCredenciais } from "@/lib/credenciais";
import { FINANCEIRAS, chavesDoFinanceiro } from "@/lib/credenciais-financeiro";

export const dynamic = "force-dynamic";
export const metadata = { title: "Credenciais - Ávila Ops" };

/**
 * As credenciais por assunto, e não por nome de variável.
 *
 * O cofre completo (`/operacao/credenciais`) continua existindo e é a tela de
 * quem sabe o que procura: lista toda chave do parque, em ordem alfabética.
 * Esta é a de quem quer trocar o token de uma financeira e não precisa saber
 * que ela se chama `MP_ACCESS_TOKEN`.
 */
export default async function CredenciaisDaEmpresaPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  if (!ehDono(admin.role)) redirect("/mais");

  const guardadas = await listarCredenciais();
  const preenchidas = new Set(guardadas.filter((c) => c.preenchida).map((c) => c.chave));
  const doFinanceiro = chavesDoFinanceiro();
  const prontas = doFinanceiro.filter((chave) => preenchidas.has(chave)).length;

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="menu">
      <CabecalhoTela
        titulo="Credenciais"
        descricao="Guardadas cifradas no banco, nunca em arquivo aberto."
        voltar={{ href: "/empresa", rotulo: "Voltar para Empresa" }}
      />

      <div className="pilha">
        <Grupo titulo="Por assunto">
          <LinhaLink
            href="/empresa/credenciais/financeiro"
            titulo="Financeiro"
            descricao={`${FINANCEIRAS.length} serviços · ${prontas} de ${doFinanceiro.length} chaves preenchidas`}
            icone="financeiro"
            tom="azul"
          />
        </Grupo>

        <Grupo titulo="Tudo que a casa guarda">
          <LinhaLink
            href="/operacao/credenciais"
            titulo="Cofre completo"
            descricao={`${guardadas.length} chaves de todas as integrações, por nome de variável`}
            icone="config"
            tom="neutro"
          />
        </Grupo>
      </div>
    </AppShell>
  );
}
