import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import CabecalhoPagina from "@/components/hub-social/CabecalhoPagina";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import BadgeStatus from "@/components/sistema/Status";
import EditarProduto from "@/components/lojas/EditarProduto";
import { getAdmin } from "@/lib/auth";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { enderecoDaConsulta, lerConsulta } from "@/lib/lojas-catalogo";
import { autorDaAlteracao, rotuloDoCampo, valorDoCampo } from "@/lib/lojas-historico";
import { montarDetalheDoProduto } from "@/lib/lojas-servidor";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const ORIGEM_DA_FOTO: Record<string, string> = {
  propria: "Foto do próprio item",
  representativa: "Foto de outro item da mesma família",
  ilustracao: "Ilustração, não fotografia",
};

/**
 * A ficha de um produto.
 *
 * O catálogo é da loja e o estado oficial mora na plataforma de lojas. Daqui
 * dá para alterar situação, categoria e preço (`EditarProduto`): quem grava é
 * a plataforma, com o nome de quem está logado no histórico dela. Estoque,
 * fotos e textos seguem no painel da loja, por importação ou pelo ERP.
 *
 * O endereço traz a consulta da lista de onde a pessoa veio (filtros, ordem,
 * página): "voltar" devolve exatamente aquele contexto, na linha do produto.
 */
export default async function ProdutoDaLojaPage({ params, searchParams }: Params) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const { slug, id } = await params;
  // A consulta da lista veio no endereço; relida pelas mesmas regras (nada de
  // endereço livre vindo de fora) e devolvida com a âncora da linha do produto.
  const voltar = `${enderecoDaConsulta(`/lojas/${slug}`, lerConsulta(await searchParams))}#p-${id}`;

  const detalhe = await montarDetalheDoProduto(slug, id);
  if (detalhe.estado === "nao-encontrado") notFound();

  const migalhas = (nome: string) => (
    <nav className="catalogo-migalhas" aria-label="Você está em">
      <Link href="/lojas">Lojas</Link>
      <span aria-hidden="true">/</span>
      <Link href={voltar}>{slug}</Link>
      <span aria-hidden="true">/</span>
      <Link href={voltar}>Produtos</Link>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{nome}</span>
    </nav>
  );

  if (detalhe.estado === "falha") {
    return (
      <>
        {migalhas("Produto")}
        <CabecalhoPagina titulo="Produto" subtitulo="Não foi possível ler este produto." voltar={{ href: voltar, label: "Voltar para a lista" }} />
        <EstadoVazio
          compacto
          titulo={detalhe.configurado ? "A plataforma de lojas não respondeu" : "Plataforma de lojas não configurada"}
          descricao={detalhe.motivo}
          acao={{ label: "Voltar para a lista", href: voltar }}
        />
      </>
    );
  }

  const { produto, historico, resumo, categorias } = detalhe.ficha;
  const semPreco = produto.precoCentavos <= 0;
  // O estoque que vale é o das variações, calculado pela plataforma como na
  // lista. Plataforma antiga, sem esse campo, cai na cópia do cadastro — e diz.
  const estoqueOficial = resumo
    ? resumo.estoqueEstado === "nao-controla"
      ? "Não controla estoque"
      : resumo.estoqueEstado === "desconhecido"
        ? "Sem saldo cadastrado (disponibilidade desconhecida)"
        : `${(resumo.estoque ?? 0).toLocaleString("pt-BR")} disponível`
    : produto.estoque === null
      ? "Não controla estoque"
      : produto.estoque.toLocaleString("pt-BR");
  const ultimaAutomatica = historico[0] && autorDaAlteracao(historico[0].origem).tipo === "automatica" ? autorDaAlteracao(historico[0].origem).caminho : null;

  return (
    <>
      {migalhas(produto.nome)}
      <CabecalhoPagina
        titulo={produto.nome}
        subtitulo={[produto.marca ?? "sem marca", produto.categoria?.nome ?? "sem categoria"].join(" · ")}
        voltar={{ href: voltar, label: "Voltar para a lista" }}
        meta={<BadgeStatus status={produto.ativo ? "active" : "inactive"} />}
      />

      <div className="produto-ficha">
        <section aria-label="Fotos">
          {produto.imagens.length === 0 ? (
            <p className="catalogo-sem-foto produto-sem-foto">Sem foto cadastrada</p>
          ) : (
            <ul className="produto-fotos">
              {produto.imagens.slice(0, 8).map((url) => (
                <li key={url}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- foto servida pela loja, em domínio que varia por cliente */}
                  <img src={url} alt="" loading="lazy" decoding="async" />
                </li>
              ))}
            </ul>
          )}
          <p className="produto-nota">
            {produto.imagens.length > 0 ? (ORIGEM_DA_FOTO[produto.imagemOrigem] ?? produto.imagemOrigem) : null}
            {produto.imagemFamilia ? ` · família ${produto.imagemFamilia}` : ""}
          </p>
        </section>

        <section aria-label="Dados do produto">
          <dl className="produto-dados">
            <div>
              <dt>Preço</dt>
              <dd className="catalogo-numero">
                {semPreco ? "Sob consulta (preço zero)" : formatCurrency(produto.precoCentavos / 100)}
                {produto.precoDeCentavos ? <small> de {formatCurrency(produto.precoDeCentavos / 100)}</small> : null}
              </dd>
            </div>
            <div>
              <dt>Estoque</dt>
              <dd className="catalogo-numero">
                {estoqueOficial}
                {resumo && resumo.variacoes > 0 ? <small>somado em {resumo.variacoes} variações</small> : null}
              </dd>
            </div>
            <div>
              <dt>Disponibilidade declarada</dt>
              <dd>
                {({ in_stock: "Em estoque", out_of_stock: "Esgotado", backorder: "Sob encomenda" } as Record<string, string>)[
                  produto.disponibilidade
                ] ?? produto.disponibilidade}
              </dd>
            </div>
            <div>
              <dt>SKU</dt>
              <dd className="catalogo-sku">{produto.sku ?? "—"}</dd>
            </div>
            <div>
              <dt>GTIN</dt>
              <dd className="catalogo-sku">{produto.gtin ?? "—"}</dd>
            </div>
            <div>
              <dt>Atualizado em</dt>
              <dd>{formatDateTime(produto.atualizadoEm)}</dd>
            </div>
          </dl>
          {produto.descricaoCurta ? <p className="produto-nota">{produto.descricaoCurta}</p> : null}
          <p className="produto-nota">
            Estes dados são da loja. Situação, categoria e preço podem ser alterados abaixo; o resto, no painel dela, por
            importação ou pelo ERP. Lido da plataforma em{" "}
            {formatDateTime(detalhe.lidoEm)}.
          </p>
        </section>
      </div>

      <section className="produto-historico" aria-label="Alterar produto">
        <EditarProduto
          // A versão na chave: salvou, a ficha relê e o formulário renasce com os valores da plataforma.
          key={produto.versaoCatalogo}
          slug={slug}
          id={produto.id}
          versao={produto.versaoCatalogo}
          ativo={produto.ativo}
          precoCentavos={produto.precoCentavos}
          categoria={produto.categoria?.slug ?? null}
          categorias={(categorias ?? []).map((c) => ({ valor: c.slug, rotulo: c.nome }))}
          temVariacoes={(resumo?.variacoes ?? 0) > 0}
          sincronizado={ultimaAutomatica}
        />
      </section>

      <section className="produto-historico" aria-label="Histórico de alterações">
        <h2>Histórico de alterações</h2>
        {historico.length === 0 ? (
          <p className="produto-nota">A plataforma não registrou nenhuma alteração deste produto.</p>
        ) : (
          <ol>
            {historico.map((alteracao) => (
              <li key={alteracao.versao}>
                <header>
                  <strong>{formatDateTime(alteracao.criadoEm)}</strong>
                  <span>
                    {(() => {
                      const quem = autorDaAlteracao(alteracao.origem);
                      return quem.tipo === "automatica"
                        ? `${quem.caminho} · automática`
                        : `${quem.caminho} · ${quem.autor ?? "autor não registrado"}`;
                    })()}
                    {" · "}versão {alteracao.versao}
                  </span>
                </header>
                <ul>
                  {alteracao.campos.slice(0, 8).map((campo) => (
                    <li key={campo}>
                      <strong>{rotuloDoCampo(campo)}</strong>: {valorDoCampo(campo, alteracao.antes?.[campo])} → {valorDoCampo(campo, alteracao.depois?.[campo])}
                    </li>
                  ))}
                  {alteracao.campos.length > 8 ? <li>e mais {alteracao.campos.length - 8} campos</li> : null}
                </ul>
              </li>
            ))}
          </ol>
        )}
        <p className="produto-nota">
          Registro gravado pela plataforma de lojas na mesma operação de cada mudança (as 20 mais recentes); não se edita.
          Alteração feita por pessoa a partir de 09/10/2026 traz quem foi. As anteriores, e as feitas pelo painel da loja
          antes dessa data, aparecem como “autor não registrado”: o dado não existe e não é inventado aqui.
        </p>
      </section>
    </>
  );
}
