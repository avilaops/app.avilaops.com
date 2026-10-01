import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CabecalhoTela from "@/components/sistema/CabecalhoTela";
import { Grupo, LinhaLink } from "@/components/sistema/Lista";
import AbasDaEmpresa from "@/app/empresa/AbasDaEmpresa";
import CertificadoDaCasaForm from "@/app/empresa/credenciais/CertificadoDaCasaForm";
import { ehDono, getAdmin } from "@/lib/auth";
import { listarCredenciais } from "@/lib/credenciais";
import { FINANCEIRAS, instituicoesLivres, slugDaInstituicao } from "@/lib/credenciais-financeiro";
import { certificadoDaCasa, dadosFiscaisDaCasa } from "@/lib/dados-da-casa";

export const dynamic = "force-dynamic";
export const metadata = { title: "Credenciais - Ávila Ops" };

/**
 * A aba de segredos da casa: o certificado digital e as chaves dos bancos.
 *
 * O cofre completo (`/operacao/credenciais`) continua existindo e é a tela de
 * quem sabe o que procura: lista toda chave do parque por nome de variável.
 * Esta é a de quem quer trocar o token de um banco e não precisa saber que ele
 * se chama `MP_ACCESS_TOKEN`.
 */
export default async function CredenciaisDaEmpresaPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  if (!ehDono(admin.role)) redirect("/mais");

  const [guardadas, certificado, dados] = await Promise.all([
    listarCredenciais(),
    certificadoDaCasa(),
    dadosFiscaisDaCasa(),
  ]);
  const preenchidas = new Set(guardadas.filter((c) => c.preenchida).map((c) => c.chave));
  const livres = instituicoesLivres(guardadas);
  const livresPorSlug = new Map<string, number>();
  for (const c of guardadas) {
    if (c.grupo) {
      const slug = slugDaInstituicao(c.grupo);
      livresPorSlug.set(slug, (livresPorSlug.get(slug) ?? 0) + 1);
    }
  }

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="menu">
      <CabecalhoTela
        titulo="Empresa"
        descricao="Guardadas cifradas no banco, nunca em arquivo aberto."
        voltar={{ href: "/mais", rotulo: "Voltar para Mais" }}
      />

      <AbasDaEmpresa ativa="credenciais" />

      <div className="pilha">
        <CertificadoDaCasaForm certificado={certificado} cnpjCadastrado={dados.cnpj} />

        <Grupo titulo="Bancos e pagamentos">
          {FINANCEIRAS.map((financeira) => {
            const total = financeira.campos.length;
            const prontas = financeira.campos.filter((c) => preenchidas.has(c.chave)).length;
            const faltaObrigatoria = financeira.campos.some(
              (c) => c.obrigatorio && !preenchidas.has(c.chave),
            );
            const manuais = livresPorSlug.get(financeira.slug) ?? 0;

            return (
              <LinhaLink
                key={financeira.slug}
                href={`/empresa/credenciais/financeiro/${financeira.slug}`}
                titulo={financeira.nome}
                descricao={financeira.papel}
                icone="financeiro"
                tom={total === 0 ? "neutro" : faltaObrigatoria ? "amarelo" : "azul"}
                // Sem chave no catálogo, "0 de 0" seria meia-verdade: o que
                // existe ali é o que o dono guardou à mão.
                valor={
                  total > 0
                    ? `${prontas}/${total}`
                    : manuais
                      ? `${manuais} ${manuais === 1 ? "campo" : "campos"}`
                      : "vazio"
                }
              />
            );
          })}
          {livres.map((instituicao) => (
            <LinhaLink
              key={instituicao.slug}
              href={`/empresa/credenciais/financeiro/${instituicao.slug}`}
              titulo={instituicao.nome}
              descricao="Cadastrada à mão. Nenhuma integração lê estes campos."
              icone="financeiro"
              tom="neutro"
              valor={`${instituicao.total} ${instituicao.total === 1 ? "campo" : "campos"}`}
            />
          ))}
          <LinhaLink
            href="/empresa/credenciais/financeiro/nova"
            titulo="Adicionar outra instituição"
            descricao="Banco ou meio de pagamento que não está na lista"
            icone="config"
            tom="neutro"
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
