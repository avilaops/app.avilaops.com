import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import CriarMensalidade from "@/components/CriarMensalidade";
import ControleDeIsencao from "@/components/lojas/ControleDeIsencao";
import CabecalhoPagina from "@/components/hub-social/CabecalhoPagina";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import FiltrosDoCatalogo from "@/components/lojas/FiltrosDoCatalogo";
import { LinkCatalogo, ResultadoDoCatalogo } from "@/components/lojas/navegacao-catalogo";
import PreferenciasDaTabela from "@/components/lojas/PreferenciasDaTabela";
import VincularCliente from "@/components/lojas/VincularCliente";
import BadgeStatus from "@/components/sistema/Status";
import { ehDono, getAdmin } from "@/lib/auth";
import { contar, formatCurrency, formatDateTime, formatShortDate, nomeProprio } from "@/lib/format";
import {
  TAMANHOS_DE_PAGINA,
  agruparPagina,
  consultaDoIndicador,
  enderecoDaConsulta,
  filtrosAtivos,
  indicadorSelecionado,
  lerConsulta,
  pendenciaDoProduto,
  sobConsulta,
  type Consulta,
  type Pendencia,
  type ProdutoResumido,
} from "@/lib/lojas-catalogo";
import { enderecoDaLoja, rotuloDoPlano, sugerirCliente } from "@/lib/lojas-painel";
import { montarDetalheDaLoja } from "@/lib/lojas-servidor";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const preco = (p: ProdutoResumido) => (sobConsulta(p) ? "Sob consulta" : formatCurrency(p.precoCentavos / 100));
/** Três estados que não se confundem: a loja não conta, ninguém cadastrou saldo, ou há número (que pode ser zero). */
const estoque = (p: ProdutoResumido) =>
  p.estoqueEstado === "nao-controla"
    ? "Não controla"
    : p.estoqueEstado === "desconhecido"
      ? "Sem saldo cadastrado"
      : (p.estoque ?? 0).toLocaleString("pt-BR");

/** Miniatura, ou um espaço discreto quando não há foto. Nunca uma imagem inventada. */
function Miniatura({ produto }: { produto: ProdutoResumido }) {
  return produto.imagem ? (
    // eslint-disable-next-line @next/next/no-img-element -- foto servida pela loja, em domínio que varia por cliente
    <img className="catalogo-miniatura" src={produto.imagem} alt="" width={44} height={44} loading="lazy" decoding="async" />
  ) : (
    <span className="catalogo-miniatura catalogo-sem-foto" aria-hidden="true">
      sem foto
    </span>
  );
}

export default async function LojaPage({ params, searchParams }: Params) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const { slug } = await params;
  const bruto = await searchParams;
  const consulta = lerConsulta(bruto);
  // Uma leitura por abertura: a plataforma devolve a página pedida e os
  // totais, calculados no banco dela. Nada do catálogo fica guardado aqui.
  const detalhe = await montarDetalheDaLoja(slug, consulta);

  // Plataforma configurada e respondendo, e a loja não existe lá: 404 de
  // verdade. Sem token ou com a plataforma fora do ar, a tela explica em vez
  // de dizer que a loja não existe — são coisas diferentes.
  if (detalhe.configurado && !detalhe.ficha && detalhe.falhas.some((f) => f.includes("não encontrada"))) {
    notFound();
  }

  const ficha = detalhe.ficha;
  const dono = ehDono(admin.role);
  const base = `/lojas/${slug}`;

  const pagina = detalhe.catalogo;
  const resumo = pagina?.resumo ?? null;
  const grupos = pagina ? agruparPagina(pagina, consulta.grupo) : [];
  // Estoque só é assunto desta loja se algum produto tem contagem. Sem isso,
  // filtro, ordenação e coluna de estoque seriam controles que não fazem nada.
  const temEstoque = (resumo?.controlamEstoque ?? 0) > 0;
  const comFiltro = filtrosAtivos(consulta) > 0;

  const ir = (mudanca: Partial<Consulta>) => enderecoDaConsulta(base, consulta, mudanca);
  // A ficha do produto recebe a MESMA consulta da lista (filtros, ordem,
  // página) e monta sozinha o caminho de volta, até a linha do produto.
  const consultaNoEndereco = enderecoDaConsulta("", { ...consulta, pagina: pagina?.pagina ?? consulta.pagina });
  const fichaDoProduto = (produto: ProdutoResumido) => `${base}/produtos/${produto.id}${consultaNoEndereco}`;

  const indicadores: { pendencia: Pendencia; rotulo: string; total: number; regra: string }[] = [
    { pendencia: "sem-foto", rotulo: "Sem foto", total: resumo?.semFoto ?? 0, regra: "ativos com nenhuma imagem" },
    { pendencia: "sob-consulta", rotulo: "Sem preço", total: resumo?.sobConsulta ?? 0, regra: "ativos com preço zero: a vitrine mostra “sob consulta”" },
    ...(temEstoque
      ? [{ pendencia: "anuncia-sem-saldo" as const, rotulo: "Anuncia sem saldo", total: resumo?.anunciaSemSaldo ?? 0, regra: "ativos marcados “em estoque” com saldo das variações zerado" }]
      : []),
    { pendencia: "foto-de-outro", rotulo: "Foto de outro item", total: resumo?.fotoDeOutroItem ?? 0, regra: "ativos com foto declarada como representativa ou ilustração" },
  ];

  return (
    <>
      <nav className="catalogo-migalhas" aria-label="Você está em">
        <Link href="/lojas">Lojas</Link>
        <span aria-hidden="true">/</span>
        <span>{ficha?.nome ?? slug}</span>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Produtos</span>
      </nav>

      <CabecalhoPagina
        titulo={ficha?.nome ?? slug}
        subtitulo={
          ficha
            ? `${enderecoDaLoja(ficha).replace("https://", "")} · ${rotuloDoPlano(ficha.plano)} · criada em ${formatShortDate(ficha.criadoEm)}`
            : "Não foi possível ler a ficha desta loja."
        }
        voltar={{ href: "/lojas", label: "Voltar para Lojas" }}
        meta={ficha ? <BadgeStatus status={ficha.status} /> : undefined}
        acoes={
          ficha ? (
            <a className="secondary-button" href={enderecoDaLoja(ficha)} target="_blank" rel="noreferrer">
              Abrir vitrine
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
        <section className="catalogo-loja" aria-label="Administração da loja">
          <dl>
            <div>
              <dt>Cliente</dt>
              <dd>
                {detalhe.cliente ? (
                  <Link href={`/clientes/${detalhe.cliente.id}`} className="text-link">
                    {nomeProprio(detalhe.cliente.nome)}
                  </Link>
                ) : (
                  <VincularCliente
                    slug={slug}
                    nomeDaLoja={ficha.nome}
                    sugestao={sugerirCliente(ficha, detalhe.clientes)}
                    clientes={detalhe.clientes}
                  />
                )}
              </dd>
            </div>
            <div>
              <dt>Assinatura</dt>
              <dd>
                {ficha.cobrancaIsenta ? "Isenta (cobrada fora da plataforma)" : <BadgeStatus status={ficha.assinaturaStatus} />}
                <small>
                  {ficha.ultimoPagamentoEm
                    ? `último pagamento em ${formatShortDate(ficha.ultimoPagamentoEm)}`
                    : "nenhum pagamento registrado"}
                </small>
              </dd>
            </div>
            <div>
              <dt>Pedidos</dt>
              <dd className="catalogo-numero">{ficha._count.pedidos.toLocaleString("pt-BR")}</dd>
            </div>
            <div>
              <dt>Categorias</dt>
              <dd className="catalogo-numero">{ficha._count.categorias.toLocaleString("pt-BR")}</dd>
            </div>
          </dl>

          <details className="catalogo-assinatura">
            <summary>Gerenciar assinatura e isenção</summary>
            <div>
              <p>
                A mensalidade pertence à <strong>loja</strong> e mora na plataforma de lojas (plano {rotuloDoPlano(ficha.plano)}
                ). São quatro coisas diferentes: o <strong>plano</strong> diz o que a loja tem; o <strong>acesso</strong> é o
                status dela (no ar, suspensa); a <strong>cobrança</strong> começa quando a mensalidade é criada no Mercado
                Pago e o lojista cadastra o cartão; e o <strong>pagamento</strong> só é confirmado pelo aviso do Mercado
                Pago. Nada nesta tela marca cobrança como paga.
              </p>
              {!dono ? (
                <p>Só o dono da conta cria, altera ou cancela mensalidade, e marca ou tira isenção.</p>
              ) : ficha.cobrancaIsenta ? (
                <p>
                  Esta loja está isenta: a plataforma não a cobra e a régua de inadimplência a ignora. Enquanto estiver
                  isenta, criar mensalidade aqui fica bloqueado, porque faria o cliente pagar duas vezes.
                </p>
              ) : ficha.assinaturaId ? (
                <p>
                  Esta loja já tem mensalidade no Mercado Pago. Alterar valor, pausar, retomar e cancelar ficam em Financeiro ›
                  Mercado Pago, que mostra o valor e a próxima cobrança lidos de lá.
                </p>
              ) : ficha.status === "CANCELADA" ? (
                <p>Loja cancelada não recebe mensalidade nova.</p>
              ) : (
                <CriarMensalidade slug={slug} nome={ficha.nome} plano={rotuloDoPlano(ficha.plano)} />
              )}
              {dono && detalhe.isencao ? <ControleDeIsencao slug={slug} nome={ficha.nome} situacao={detalhe.isencao} /> : null}
              <p>
                <Link className="text-link" href="/financeiro/mercadopago">
                  Ver todas as mensalidades e recebimentos
                </Link>
              </p>
            </div>
          </details>
        </section>
      )}

      {!pagina || !resumo ? (
        // Falha de leitura não é catálogo vazio, e nenhum indicador vira zero por causa dela.
        <EstadoVazio
          compacto
          titulo="Não consegui ler o catálogo"
          descricao="A plataforma de lojas não respondeu a esta leitura. Nenhum número é mostrado: zero aqui seria mentira."
          acao={{ label: "Tentar de novo", href: enderecoDaConsulta(base, consulta) }}
        />
      ) : (
        <>
          <section className="catalogo-indicadores" aria-label="Catálogo inteiro da loja">
            <header>
              <h2>Catálogo</h2>
              <p>
                {contar(resumo.total, "produto", "produtos")} na loja · lido da plataforma em {formatDateTime(pagina.lidoEm)}
                {" · "}
                {/* Link comum, de propósito: recarrega a página inteira e relê tudo na plataforma. */}
                <a className="text-link" href={enderecoDaConsulta(base, { ...consulta, pagina: pagina.pagina })}>
                  Atualizar
                </a>
              </p>
            </header>
            <div className="catalogo-atalhos">
              <LinkCatalogo
                className="catalogo-atalho"
                href={ir({ ...consultaDoIndicador("sem-foto"), pendencias: [], situacao: "ativos" })}
                aria-pressed={consulta.situacao === "ativos" && filtrosAtivos(consulta) === 1}
              >
                <strong>{resumo.ativos.toLocaleString("pt-BR")}</strong>
                <span>Ativos</span>
              </LinkCatalogo>
              <LinkCatalogo
                className="catalogo-atalho"
                href={ir({ ...consultaDoIndicador("sem-foto"), pendencias: [], situacao: "inativos" })}
                aria-pressed={consulta.situacao === "inativos" && filtrosAtivos(consulta) === 1}
              >
                <strong>{resumo.inativos.toLocaleString("pt-BR")}</strong>
                <span>Inativos</span>
              </LinkCatalogo>
              {indicadores.map((i) => (
                <LinkCatalogo
                  key={i.pendencia}
                  className="catalogo-atalho"
                  data-tom={i.total > 0 ? (i.pendencia === "foto-de-outro" || i.pendencia === "sob-consulta" ? "atencao" : "ruim") : "bom"}
                  href={ir(consultaDoIndicador(i.pendencia))}
                  aria-pressed={indicadorSelecionado(consulta, i.pendencia)}
                  title={`Contagem: ${i.regra}`}
                >
                  <strong>{i.total.toLocaleString("pt-BR")}</strong>
                  <span>{i.rotulo}</span>
                </LinkCatalogo>
              ))}
            </div>
            <details className="catalogo-regras">
              <summary>Como estes números são calculados</summary>
              <ul>
                <li>
                  Fonte: plataforma de lojas, <code>GET /api/admin/tenants/{slug}/produtos/consulta</code>. A contagem é
                  feita no banco dela a cada abertura desta tela; nada fica guardado aqui. São contagens: não se editam,
                  mudam quando o produto muda na loja.
                </li>
                <li>Ativos e inativos: o campo “ativo” do produto. Inativo não aparece na vitrine; não é loja fora do ar.</li>
                {indicadores.map((i) => (
                  <li key={i.pendencia}>
                    {i.rotulo}: {i.regra}.
                  </li>
                ))}
                <li>
                  Estoque: vem das variações do produto (saldo físico menos o reservado por pedidos em aberto), não da
                  cópia no cadastro. {contar(resumo.controlamEstoque, "produto tem", "produtos têm")} contagem,{" "}
                  {resumo.naoControlamEstoque.toLocaleString("pt-BR")} não controlam estoque e{" "}
                  {resumo.estoqueDesconhecido.toLocaleString("pt-BR")} estão sem saldo cadastrado.
                  {temEstoque ? "" : " Como nenhum tem contagem, não há indicador, filtro nem coluna de estoque nesta loja."}
                </li>
              </ul>
            </details>
          </section>

          <FiltrosDoCatalogo
            base={base}
            consulta={consulta}
            categorias={pagina.facetas.categorias}
            marcas={pagina.facetas.marcas}
            temEstoque={temEstoque}
          />

          <ResultadoDoCatalogo>
            <div className="catalogo-barra">
              <p role="status" aria-live="polite">
                {pagina.total === 0
                  ? "Nenhum produto encontrado"
                  : `${pagina.de.toLocaleString("pt-BR")}–${pagina.ate.toLocaleString("pt-BR")} de ${contar(pagina.total, "produto encontrado", "produtos encontrados")}`}
                {comFiltro ? ` · de ${resumo.total.toLocaleString("pt-BR")} na loja` : ""}
              </p>
              <PreferenciasDaTabela alvo="catalogo-tabela" chave={`${admin.id}:${slug}`} semEstoque={!temEstoque} />
            </div>

            {pagina.total === 0 ? (
              <EstadoVazio
                compacto
                titulo={resumo.total === 0 ? "Catálogo vazio" : "Nada encontrado"}
                descricao={
                  resumo.total === 0
                    ? "A plataforma respondeu e esta loja não tem nenhum produto cadastrado."
                    : "Nenhum produto casa com a busca e os filtros atuais."
                }
                acao={resumo.total === 0 ? undefined : { label: "Limpar filtros", href: base }}
              />
            ) : (
              <>
                {/* Desktop: tabela. As larguras são fixas para o preço e as
                    ações nunca saírem da área visível; o nome é quem cede. */}
                <div className="catalogo-tabela" id="catalogo-tabela" data-sem-estoque={temEstoque ? undefined : "sim"}>
                  <table>
                    <caption className="sr-only">Produtos da loja {ficha?.nome ?? slug}</caption>
                    <thead>
                      <tr>
                        <th scope="col" className="col-foto">
                          <span className="sr-only">Foto</span>
                        </th>
                        <th scope="col" className="col-produto">Produto</th>
                        <th scope="col" className="col-sku">SKU</th>
                        <th scope="col" className="col-categoria">Categoria</th>
                        <th scope="col" className="col-situacao">Situação</th>
                        <th scope="col" className="col-preco">Preço</th>
                        <th scope="col" className="col-estoque">Estoque</th>
                        <th scope="col" className="col-acoes">
                          <span className="sr-only">Ações</span>
                        </th>
                      </tr>
                    </thead>
                    {grupos.map((grupo) => (
                      <tbody key={grupo.chave || "todos"}>
                        {grupo.chave ? (
                          <tr className="catalogo-grupo">
                            <th scope="rowgroup" colSpan={8}>
                              {grupo.chave} <span>{contar(grupo.total, "produto", "produtos")}</span>
                            </th>
                          </tr>
                        ) : null}
                        {grupo.itens.map((produto) => {
                          const pendencia = pendenciaDoProduto(produto);
                          return (
                            <tr key={produto.id} id={`p-${produto.id}`}>
                              <td className="col-foto">
                                <Miniatura produto={produto} />
                              </td>
                              <th scope="row" className="col-produto">
                                <LinkCatalogo href={fichaDoProduto(produto)}>{produto.nome}</LinkCatalogo>
                                <small>
                                  {produto.marca ?? "sem marca"}
                                  {pendencia ? (
                                    <>
                                      {" · "}
                                      <span data-grave={pendencia.grave ? "sim" : "nao"}>{pendencia.texto}</span>
                                    </>
                                  ) : null}
                                </small>
                              </th>
                              <td className="col-sku">{produto.sku ?? "—"}</td>
                              <td className="col-categoria">{produto.categoria?.nome ?? "—"}</td>
                              <td className="col-situacao">
                                <BadgeStatus status={produto.ativo ? "active" : "inactive"} />
                              </td>
                              <td className="col-preco">{preco(produto)}</td>
                              <td className="col-estoque">{estoque(produto)}</td>
                              <td className="col-acoes">
                                <LinkCatalogo className="text-button" href={fichaDoProduto(produto)} aria-label={`Abrir ${produto.nome}`}>
                                  Abrir
                                </LinkCatalogo>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    ))}
                  </table>
                </div>

                {/* Celular: lista compacta. Miniatura, nome, preço e situação
                    à vista; o resto a um toque, sem rolagem lateral. */}
                <div className="catalogo-lista">
                  {grupos.map((grupo) => (
                    <section key={grupo.chave || "todos"}>
                      {grupo.chave ? (
                        <h3>
                          {grupo.chave} <span>{contar(grupo.total, "produto", "produtos")}</span>
                        </h3>
                      ) : null}
                      <ul>
                        {grupo.itens.map((produto) => {
                          const pendencia = pendenciaDoProduto(produto);
                          return (
                            <li key={produto.id} id={`m-${produto.id}`}>
                              <details>
                                <summary>
                                  <Miniatura produto={produto} />
                                  <span className="catalogo-item-texto">
                                    <strong>{produto.nome}</strong>
                                    <small>
                                      {produto.marca ?? "sem marca"}
                                      {pendencia ? ` · ${pendencia.texto}` : ""}
                                    </small>
                                  </span>
                                  <span className="catalogo-item-valor">
                                    <span>{preco(produto)}</span>
                                    <BadgeStatus status={produto.ativo ? "active" : "inactive"} />
                                  </span>
                                </summary>
                                <dl>
                                  <div>
                                    <dt>SKU</dt>
                                    <dd className="catalogo-sku">{produto.sku ?? "—"}</dd>
                                  </div>
                                  <div>
                                    <dt>Categoria</dt>
                                    <dd>{produto.categoria?.nome ?? "—"}</dd>
                                  </div>
                                  <div>
                                    <dt>Estoque</dt>
                                    <dd>{estoque(produto)}</dd>
                                  </div>
                                </dl>
                                <LinkCatalogo className="secondary-button" href={fichaDoProduto(produto)}>
                                  Abrir produto
                                </LinkCatalogo>
                              </details>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))}
                </div>

                <nav className="catalogo-paginacao" aria-label="Paginação do catálogo">
                  <div className="catalogo-por-pagina" role="group" aria-label="Produtos por página">
                    <span>Por página</span>
                    {TAMANHOS_DE_PAGINA.map((tamanho) => (
                      <LinkCatalogo
                        key={tamanho}
                        className="chip-toggle"
                        href={ir({ por: tamanho })}
                        aria-pressed={consulta.por === tamanho}
                        aria-label={`${tamanho} produtos por página`}
                      >
                        {tamanho}
                      </LinkCatalogo>
                    ))}
                  </div>
                  <div className="catalogo-paginas">
                    {pagina.pagina > 1 ? (
                      <LinkCatalogo className="secondary-button" href={ir({ pagina: pagina.pagina - 1 })} rel="prev">
                        Anterior
                      </LinkCatalogo>
                    ) : (
                      <span className="secondary-button" aria-disabled="true">
                        Anterior
                      </span>
                    )}
                    <span aria-current="page">
                      Página {pagina.pagina.toLocaleString("pt-BR")} de {pagina.paginas.toLocaleString("pt-BR")}
                    </span>
                    {pagina.pagina < pagina.paginas ? (
                      <LinkCatalogo className="secondary-button" href={ir({ pagina: pagina.pagina + 1 })} rel="next">
                        Próxima
                      </LinkCatalogo>
                    ) : (
                      <span className="secondary-button" aria-disabled="true">
                        Próxima
                      </span>
                    )}
                  </div>
                </nav>
              </>
            )}
          </ResultadoDoCatalogo>
        </>
      )}
    </>
  );
}
