import { notFound, redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CabecalhoTela from "@/components/sistema/CabecalhoTela";
import { Grupo, LinhaInfo } from "@/components/sistema/Lista";
import FormularioDaFinanceira from "@/app/empresa/credenciais/financeiro/[slug]/FormularioDaFinanceira";
import { ehDono, getAdmin } from "@/lib/auth";
import { listarCredenciais } from "@/lib/credenciais";
import { financeiraPorSlug } from "@/lib/credenciais-financeiro";

export const dynamic = "force-dynamic";

export default async function FichaDaFinanceira({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  if (!ehDono(admin.role)) redirect("/mais");

  const { slug } = await params;
  const financeira = financeiraPorSlug(slug);
  if (!financeira) notFound();

  const guardadas = await listarCredenciais();
  const porChave = new Map(guardadas.map((c) => [c.chave, c]));

  // O valor NUNCA vem para a tela: o que chega é a máscara que o cofre guarda
  // em claro ao lado do segredo ("97ad…ead7"). Ver o valor inteiro é outra
  // ação, explícita, pelo cofre completo.
  const campos = financeira.campos.map((campo) => {
    const guardada = porChave.get(campo.chave);
    return {
      ...campo,
      preenchida: guardada?.preenchida ?? false,
      mascara: guardada?.mascara ?? null,
      atualizadoEm: guardada?.rotacionadoEm ?? null,
    };
  });

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="menu">
      <CabecalhoTela
        titulo={financeira.nome}
        descricao={financeira.papel}
        voltar={{ href: "/empresa/credenciais/financeiro", rotulo: "Voltar para Financeiro" }}
      />

      <div className="pilha">
        {financeira.aviso ? (
          /*
            O aviso NÃO cabe numa `LinhaInfo`: ela corta a descrição em uma
            linha com reticências, e foi o que a conferência no navegador
            mostrou — "não se comprova no C…" num texto cujo assunto é o
            dinheiro entrar na conta errada. Aviso cortado é pior que aviso
            ausente, porque parece que alguém já leu.
          */
          <Grupo>
            <div className="aviso-financeira">
              <strong>Antes de preencher</strong>
              <p>{financeira.aviso}</p>
            </div>
          </Grupo>
        ) : null}

        {campos.length === 0 ? (
          <Grupo titulo="Nada a configurar">
            <LinhaInfo
              titulo="Nenhuma chave é lida pelo código hoje"
              descricao="Quando houver integração, os campos aparecem aqui. Inventar campo agora seria desenhar uma tela que não liga em lugar nenhum."
              icone="config"
              tom="neutro"
            />
          </Grupo>
        ) : (
          <FormularioDaFinanceira slug={financeira.slug} nome={financeira.nome} campos={campos} />
        )}
      </div>
    </AppShell>
  );
}
