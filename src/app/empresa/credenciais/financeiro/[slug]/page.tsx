import { notFound, redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CabecalhoTela from "@/components/sistema/CabecalhoTela";
import { Grupo } from "@/components/sistema/Lista";
import CamposLivres, { type CampoLivreNaTela } from "@/app/empresa/credenciais/financeiro/CamposLivres";
import FormularioDaFinanceira from "@/app/empresa/credenciais/financeiro/[slug]/FormularioDaFinanceira";
import { ehDono, getAdmin } from "@/lib/auth";
import { listarCredenciais } from "@/lib/credenciais";
import {
  PREFIXO_LIVRE,
  financeiraPorSlug,
  slugDaInstituicao,
} from "@/lib/credenciais-financeiro";

const VOLTAR = { href: "/empresa/credenciais", rotulo: "Voltar para Credenciais" };

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
  const guardadas = await listarCredenciais();

  // Os campos à mão desta instituição, achados pelo nome guardado em `grupo`.
  const livres = guardadas.filter(
    (c) => c.chave.startsWith(PREFIXO_LIVRE) && c.grupo && slugDaInstituicao(c.grupo) === slug,
  );
  const camposLivres: CampoLivreNaTela[] = livres.map((c) => ({
    chave: c.chave,
    rotulo: c.rotulo ?? c.chave,
    mascara: c.mascara,
    atualizadoEm: c.rotacionadoEm,
  }));

  if (slug === "nova") {
    return (
      <AppShell adminName={admin.nome} papel={admin.role} section="menu">
        <CabecalhoTela
          titulo="Outra instituição"
          descricao="Um banco ou meio de pagamento que a lista não tem."
          voltar={VOLTAR}
        />
        <div className="pilha">
          <CamposLivres instituicao={null} campos={[]} />
        </div>
      </AppShell>
    );
  }

  const financeira = financeiraPorSlug(slug);
  if (!financeira) {
    // Instituição cadastrada à mão: só existe enquanto tiver campo guardado.
    if (!livres.length) notFound();
    const nome = livres[0].grupo!;
    return (
      <AppShell adminName={admin.nome} papel={admin.role} section="menu">
        <CabecalhoTela
          titulo={nome}
          descricao="Cadastrada à mão. Nenhuma integração lê estes campos."
          voltar={VOLTAR}
        />
        <div className="pilha">
          <CamposLivres instituicao={nome} campos={camposLivres} />
        </div>
      </AppShell>
    );
  }

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
        voltar={VOLTAR}
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
          // Sem integração, o catálogo não inventa campo — quem nomeia é o
          // dono, e a tela diz que nada lê o que for guardado aqui.
          <CamposLivres instituicao={financeira.nome} campos={camposLivres} />
        ) : (
          <FormularioDaFinanceira slug={financeira.slug} nome={financeira.nome} campos={campos} />
        )}
      </div>
    </AppShell>
  );
}
