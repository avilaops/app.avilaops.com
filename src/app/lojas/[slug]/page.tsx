import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import CabecalhoPagina from "@/components/hub-social/CabecalhoPagina";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import GradeMetricas, { Metrica } from "@/components/hub-social/Metricas";
import TabelaResponsiva from "@/components/hub-social/TabelaResponsiva";
import { Grupo, LinhaDobravel } from "@/components/sistema/Lista";
import VincularCliente from "@/components/lojas/VincularCliente";
import BadgeStatus from "@/components/sistema/Status";
import { getAdmin } from "@/lib/auth";
import { contar, formatCurrency, formatShortDate } from "@/lib/format";
import {
  enderecoDaLoja,
  evidenciaDaPlataforma,
  filtrarProdutos,
  lerSituacao,
  paginar,
  resumirCatalogo,
  rotuloDoPlano,
  sugerirCliente,
  SITUACOES,
} from "@/lib/lojas-painel";
import { montarDetalheDaLoja } from "@/lib/lojas-servidor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string; situacao?: string; pagina?: string }> };

/** Por que este produto aparece numa lista de problema — em uma frase. */
function defeitoDoProduto(produto: {
  ativo: boolean;
  imagens: string[];
  precoCentavos: number;
  disponibilidade: string;
  estoque: number | null;
  imagemOrigem: string;
}): { texto: string; grave: boolean } | null {
  if (!produto.ativo) return null;
  if (produto.imagens.length === 0) return { texto: "sem foto", grave: true };
  if (produto.precoCentavos <= 0) return { texto: "sem preço", grave: true };
  if (produto.disponibilidade === "in_stock" && produto.estoque !== null && produto.estoque <= 0) {
    return { texto: "anuncia estoque que não tem", grave: true };
  }
  if (produto.imagemOrigem === "representativa") return { texto: "foto de outro item da família", grave: false };
  if (produto.imagemOrigem === "ilustracao") return { texto: "ilustração, não foto", grave: false };
  return null;
}

export default async function LojaPage({ params, searchParams }: Params) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const { slug } = await params;
  const filtros = await searchParams;
  const detalhe = await montarDetalheDaLoja(slug);

  // Plataforma configurada e respondendo, e a loja não existe lá: 404 de
  // verdade. Sem token ou com a plataforma fora do ar, a tela explica em vez
  // de dizer que a loja não existe — são coisas diferentes.
  if (detalhe.configurado && !detalhe.ficha && detalhe.falhas.some((f) => f.includes("não encontrada"))) {
    notFound();
  }

  const ficha = detalhe.ficha;
  const situacao = lerSituacao(filtros.situacao);
  const busca = (filtros.q ?? "").trim();
  const filtrados = filtrarProdutos(detalhe.produtos, { busca, situacao });
  const pagina = paginar(filtrados, Number(filtros.pagina ?? "1"));
  const catalogo = resumirCatalogo(detalhe.produtos);

  const endereco = (proximo: { q?: string; situacao?: string; pagina?: number }) => {
    const query = new URLSearchParams();
    const q = proximo.q ?? busca;
    const s = proximo.situacao ?? situacao;
    if (q) query.set("q", q);
    if (s && s !== "todos") query.set("situacao", s);
    if (proximo.pagina && proximo.pagina > 1) query.set("pagina", String(proximo.pagina));
    const sufixo = query.toString();
    return sufixo ? `/lojas/${slug}?${sufixo}` : `/lojas/${slug}`;
  };

  const evidenciaDaFicha = (rotulo: string, formula: string) =>
    evidenciaDaPlataforma(rotulo, {
      formula,
      lidoEm: detalhe.lidoEm,
      bruto: ficha,
      caminho: `/api/admin/tenants/${slug}`,
      funcao: "lerLoja()",
    });

  const evidenciaCatalogo = (rotulo: string, formula: string, bruto: unknown) =>
    evidenciaDaPlataforma(rotulo, {
      formula,
      lidoEm: detalhe.lidoEm,
      bruto,
      caminho: `/api/admin/tenants/${slug}/produtos`,
      funcao: "listarProdutosDaLoja()",
    });

  return (
    <>
      <CabecalhoPagina
        titulo={ficha?.nome ?? slug}
        subtitulo={
          ficha
            ? `${rotuloDoPlano(ficha.plano)} · criada em ${formatShortDate(ficha.criadoEm)}`
            : "Não foi possível ler a ficha desta loja."
        }
        voltar={{ href: "/lojas", label: "Voltar para Lojas" }}
        acoes={
          ficha ? (
            <a
              className="secondary-button"
              href={enderecoDaLoja(ficha)}
              target="_blank"
              rel="noreferrer"
            >
              Abrir a vitrine
            </a>
          ) : undefined
        }
      />

      {!detalhe.configurado && (
        <section className="mp-alerta">
          <h2>Plataforma de lojas não configurada</h2>
          <p>
            Falta <code>LOJAS_ADMIN_TOKEN</code> no ambiente deste app.
          </p>
        </section>
      )}

      {detalhe.falhas.length > 0 && (
        <section className="mp-alerta" aria-label="Falhas de leitura">
          <h2>Nem tudo carregou</h2>
          <ul>
            {detalhe.falhas.map((falha) => (
              <li key={falha}>{falha}</li>
            ))}
          </ul>
        </section>
      )}

      {ficha && (
        <GradeMetricas rotulo="Situação da loja">
          <Metrica
            rotulo="Situação"
            valor={<BadgeStatus status={ficha.status} />}
            detalhe={enderecoDaLoja(ficha).replace("https://", "")}
            evidencia={evidenciaDaFicha("Situação da loja", "Tenant.status na plataforma de lojas")}
          />
          <Metrica
            rotulo="Cliente"
            valor={
              detalhe.cliente ? (
                <Link href={`/clientes/${detalhe.cliente.id}`} className="text-link">
                  {detalhe.cliente.nome}
                </Link>
              ) : (
                <VincularCliente
                  slug={slug}
                  nomeDaLoja={ficha.nome}
                  sugestao={sugerirCliente(ficha, detalhe.clientes)}
                  clientes={detalhe.clientes}
                />
              )
            }
            detalhe={detalhe.cliente ? "ficha no Ávila OS" : "nenhuma ficha reivindica esta loja"}
          />
          <Metrica
            rotulo="Assinatura"
            valor={<BadgeStatus status={ficha.assinaturaStatus} />}
            detalhe={
              ficha.ultimoPagamentoEm
                ? `último pagamento em ${formatShortDate(ficha.ultimoPagamentoEm)}`
                : "nenhum pagamento registrado"
            }
            evidencia={evidenciaDaFicha(
              "Assinatura",
              "assinaturaStatus e ultimoPagamentoEm, como a plataforma registrou a cobrança",
            )}
          />
          <Metrica
            rotulo="Pedidos"
            valor={ficha._count.pedidos.toLocaleString("pt-BR")}
            detalhe={`${contar(ficha._count.categorias, "categoria", "categorias")} no catálogo`}
            evidencia={evidenciaDaFicha("Pedidos", "_count.pedidos, contado pela própria plataforma")}
          />
        </GradeMetricas>
      )}

      <GradeMetricas rotulo="Saúde do catálogo">
        <Metrica
          rotulo="No ar"
          valor={catalogo.ativos.toLocaleString("pt-BR")}
          detalhe={`${catalogo.inativos} fora do ar`}
          evidencia={evidenciaCatalogo(
            "Produtos no ar",
            "produtos com ativo = true na resposta da plataforma",
            { total: catalogo.total, ativos: catalogo.ativos },
          )}
        />
        <Metrica
          rotulo="Sem foto"
          valor={catalogo.semFoto}
          href={catalogo.semFoto > 0 ? endereco({ situacao: "sem-foto", pagina: 1 }) : undefined}
          detalhe="no ar com a lista de imagens vazia"
          tom={catalogo.semFoto > 0 ? "ruim" : "bom"}
          evidencia={evidenciaCatalogo(
            "Produtos sem foto",
            "produtos ativos com imagens.length === 0",
            filtrarProdutos(detalhe.produtos, { situacao: "sem-foto" }).map((p) => p.nome),
          )}
        />
        <Metrica
          rotulo="Sem preço"
          valor={catalogo.semPreco}
          href={catalogo.semPreco > 0 ? endereco({ situacao: "sem-preco", pagina: 1 }) : undefined}
          detalhe="no ar com preço zerado"
          tom={catalogo.semPreco > 0 ? "ruim" : "bom"}
          evidencia={evidenciaCatalogo(
            "Produtos sem preço",
            "produtos ativos com precoCentavos <= 0",
            filtrarProdutos(detalhe.produtos, { situacao: "sem-preco" }).map((p) => p.nome),
          )}
        />
        <Metrica
          rotulo="Foto de outro item"
          valor={catalogo.fotoNaoEDoItem}
          href={catalogo.fotoNaoEDoItem > 0 ? endereco({ situacao: "foto-de-outro", pagina: 1 }) : undefined}
          detalhe="representativa ou ilustração, declarado na plataforma"
          tom={catalogo.fotoNaoEDoItem > 0 ? "atencao" : "bom"}
          evidencia={evidenciaCatalogo(
            "Foto que não é do item",
            'produtos ativos com imagemOrigem diferente de "propria"',
            filtrarProdutos(detalhe.produtos, { situacao: "foto-de-outro" }).map((p) => ({
              nome: p.nome,
              origem: p.imagemOrigem,
            })),
          )}
        />
      </GradeMetricas>

      <form className="barra-ferramentas" action={`/lojas/${slug}`} role="search">
        <label className="campo-busca">
          <span className="sr-only">Buscar no catálogo</span>
          <input type="search" name="q" defaultValue={busca} placeholder="Buscar por nome, SKU ou marca" />
        </label>
        {situacao !== "todos" ? <input type="hidden" name="situacao" value={situacao} /> : null}
        <button type="submit" className="secondary-button">
          Buscar
        </button>
        {busca ? (
          <Link className="text-button" href={endereco({ q: "", pagina: 1 })}>
            Limpar busca
          </Link>
        ) : null}
      </form>

      <nav className="chip-group" aria-label="Filtrar o catálogo">
        {SITUACOES.map((opcao) => (
          <Link
            key={opcao.valor}
            href={endereco({ situacao: opcao.valor, pagina: 1 })}
            className="chip-toggle"
            aria-pressed={situacao === opcao.valor}
          >
            {opcao.rotulo}
          </Link>
        ))}
      </nav>

      {pagina.total === 0 ? (
        <EstadoVazio
          compacto
          titulo={detalhe.produtos.length === 0 ? "Catálogo vazio" : "Nada encontrado"}
          descricao={
            detalhe.produtos.length === 0
              ? "A plataforma respondeu e esta loja não tem nenhum produto cadastrado."
              : "Nenhum produto casa com a busca e o filtro atuais."
          }
          acao={
            detalhe.produtos.length === 0
              ? undefined
              : { label: "Limpar filtros", href: `/lojas/${slug}` }
          }
        />
      ) : (
        <>
          {/* Cada produto era um cartão de seis andares: cinquenta por página
              davam cinquenta telas de rolagem para achar um SKU. Fechada, a
              linha diz o nome, o defeito e o preço; quem quer SKU, categoria
              e estoque abre — que é o que o toque custa. */}
          <div className="min-[821px]:hidden">
            <Grupo>
              {pagina.itens.map((produto) => {
                const defeito = defeitoDoProduto(produto);
                return (
                  <LinhaDobravel
                    key={produto.id}
                    titulo={produto.nome}
                    descricao={
                      defeito
                        ? `${produto.marca ?? "sem marca"} · ${defeito.texto}`
                        : (produto.marca ?? "sem marca")
                    }
                    valor={
                      produto.precoCentavos > 0 ? formatCurrency(produto.precoCentavos / 100) : "sem preço"
                    }
                  >
                    <div>
                      <span className="rotulo">SKU</span>
                      <span className="valor font-mono">{produto.sku ?? "—"}</span>
                    </div>
                    <div>
                      <span className="rotulo">Categoria</span>
                      <span className="valor">{produto.categoria?.nome ?? "—"}</span>
                    </div>
                    <div>
                      <span className="rotulo">Estoque</span>
                      <span className="valor font-mono">
                        {produto.estoque === null ? "não controla" : produto.estoque.toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <div>
                      <span className="rotulo">Situação</span>
                      <span className="valor">
                        <BadgeStatus status={produto.ativo ? "active" : "inactive"} />
                      </span>
                    </div>
                  </LinhaDobravel>
                );
              })}
            </Grupo>
          </div>

          <div className="max-[821px]:hidden">
          <TabelaResponsiva
            rotulo="Catálogo da loja"
            colunas={[
              { chave: "produto", rotulo: "Produto", principal: true },
              { chave: "sku", rotulo: "SKU", mono: true },
              { chave: "categoria", rotulo: "Categoria" },
              { chave: "situacao", rotulo: "Situação" },
              { chave: "preco", rotulo: "Preço", alinhar: "direita" },
              { chave: "estoque", rotulo: "Estoque", alinhar: "direita", mono: true },
            ]}
            linhas={pagina.itens.map((produto) => {
              const defeito = defeitoDoProduto(produto);
              return {
                id: produto.id,
                celulas: {
                  produto: (
                    <>
                      {produto.nome}
                      <span className="block font-sans text-[13px] font-normal text-muted-foreground">
                        {produto.marca ?? "sem marca"}
                        {defeito ? (
                          <>
                            {" · "}
                            <span className={defeito.grave ? "text-[color:var(--red)]" : "text-[color:var(--amber)]"}>
                              {defeito.texto}
                            </span>
                          </>
                        ) : null}
                      </span>
                    </>
                  ),
                  sku: produto.sku,
                  categoria: produto.categoria?.nome,
                  situacao: <BadgeStatus status={produto.ativo ? "active" : "inactive"} />,
                  preco: produto.precoCentavos > 0 ? formatCurrency(produto.precoCentavos / 100) : null,
                  estoque: produto.estoque === null ? null : produto.estoque.toLocaleString("pt-BR"),
                },
                evidencia: evidenciaDaPlataforma(produto.nome, {
                  formula: "produto como a plataforma de lojas o devolveu",
                  lidoEm: detalhe.lidoEm,
                  bruto: produto,
                  caminho: `/api/admin/tenants/${slug}/produtos`,
                  funcao: "listarProdutosDaLoja()",
                }),
              };
            })}
          />
          </div>

          <nav className="barra-ferramentas" aria-label="Paginação do catálogo">
            <span className="flex-1 text-[13px] text-muted-foreground" role="status">
              {contar(pagina.total, "produto", "produtos")}
              {pagina.paginas > 1 ? ` · página ${pagina.pagina} de ${pagina.paginas}` : ""}
            </span>
            {pagina.pagina > 1 ? (
              <Link className="text-button" href={endereco({ pagina: pagina.pagina - 1 })}>
                Anterior
              </Link>
            ) : null}
            {pagina.pagina < pagina.paginas ? (
              <Link className="text-button" href={endereco({ pagina: pagina.pagina + 1 })}>
                Próxima
              </Link>
            ) : null}
          </nav>
        </>
      )}
    </>
  );
}
