import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import CabecalhoPagina from "@/components/hub-social/CabecalhoPagina";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import BadgeStatus from "@/components/sistema/Status";
import { getAdmin } from "@/lib/auth";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { enderecoDaConsulta, lerConsulta } from "@/lib/lojas-catalogo";
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

const ORIGEM_DA_ALTERACAO: Record<string, string> = {
  painel: "Painel da loja",
  importacao: "Importação em lote",
  erp: "Sincronização do ERP",
  pesquisa: "Pesquisa de catálogo",
};

/** De onde a alteração veio, em palavras. Origem que o painel não conhece aparece como está gravada. */
function origemLegivel(origem: string): string {
  if (origem.startsWith("api:")) return `API (${origem.slice(4)})`;
  return ORIGEM_DA_ALTERACAO[origem] ?? origem;
}

/** Valor de um campo do histórico, curto o bastante para caber numa linha. Nunca segredo: o histórico é de catálogo. */
function valorCurto(valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "vazio";
  if (Array.isArray(valor)) return valor.length === 0 ? "vazio" : `${valor.length} ${valor.length === 1 ? "item" : "itens"}`;
  if (typeof valor === "object") return "objeto";
  const texto = String(valor);
  return texto.length > 60 ? `${texto.slice(0, 57)}…` : texto;
}

/**
 * A ficha de um produto, só para ler.
 *
 * O catálogo é da loja: preço, estoque, foto e situação mudam no painel da
 * loja, por importação ou pelo ERP, e cada mudança fica no histórico da
 * própria plataforma. Esta tela mostra o produto e esse histórico; não edita
 * nada, para uma alteração feita aqui não ser desfeita pela próxima
 * sincronização sem ninguém ver.
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

  const { produto, historico } = detalhe.ficha;
  const semPreco = produto.precoCentavos <= 0;

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
                {produto.estoque === null ? "Não controla estoque" : produto.estoque.toLocaleString("pt-BR")}
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
            Estes dados são da loja e se alteram no painel dela, por importação ou pelo ERP. Lido da plataforma em{" "}
            {formatDateTime(detalhe.lidoEm)}.
          </p>
        </section>
      </div>

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
                    {origemLegivel(alteracao.origem)} · versão {alteracao.versao}
                  </span>
                </header>
                <ul>
                  {alteracao.campos.slice(0, 8).map((campo) => (
                    <li key={campo}>
                      <code>{campo}</code>: {valorCurto(alteracao.antes?.[campo])} → {valorCurto(alteracao.depois?.[campo])}
                    </li>
                  ))}
                  {alteracao.campos.length > 8 ? <li>e mais {alteracao.campos.length - 8} campos</li> : null}
                </ul>
              </li>
            ))}
          </ol>
        )}
        <p className="produto-nota">
          Registro gravado pela plataforma de lojas a cada mudança (as 20 mais recentes). Não é editável por aqui.
        </p>
      </section>
    </>
  );
}
