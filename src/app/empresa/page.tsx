import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CabecalhoTela from "@/components/sistema/CabecalhoTela";
import { Grupo, LinhaInfo, LinhaLink } from "@/components/sistema/Lista";
import AbasDaEmpresa from "@/app/empresa/AbasDaEmpresa";
import DadosFiscaisForm from "@/app/empresa/DadosFiscaisForm";
import IdentidadeDaCasaForm from "@/app/empresa/IdentidadeDaCasaForm";
import { ehDono, getAdmin } from "@/lib/auth";
import {
  CAMPOS_OBRIGATORIOS_NOTA,
  REGIMES_TRIBUTARIOS,
  UFS,
  dadosFiscaisDaCasa,
} from "@/lib/dados-da-casa";
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

  const [identidade, dados] = await Promise.all([identidadeDaCasa(), dadosFiscaisDaCasa()]);

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="menu">
      <CabecalhoTela
        titulo="Empresa"
        descricao="Cadastro, logo e dados de nota fiscal da Ávila Ops."
        voltar={{ href: "/mais", rotulo: "Voltar para Mais" }}
      />

      <AbasDaEmpresa ativa="dados" />

      <div className="pilha">
        <IdentidadeDaCasaForm
          nome={identidade.nome}
          inicial={identidade.inicial}
          iconeUrl={identidade.iconeUrl}
        />

        <DadosFiscaisForm
          dados={dados}
          regimes={REGIMES_TRIBUTARIOS}
          ufs={UFS}
          obrigatorios={CAMPOS_OBRIGATORIOS_NOTA}
        />

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
