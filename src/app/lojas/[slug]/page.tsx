import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import CriarMensalidade from "@/components/CriarMensalidade";
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
  facetas,
  filtrarCatalogo,
  filtrosAtivos,
  indicadorSelecionado,
  lerConsulta,
  ordenarCatalogo,
  paginarCatalogo,
  pendenciaDoProduto,
  resumirCatalogo,
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
const estoque = (p: ProdutoResumido) => (p.estoque === null ? "Não controla" : p.estoque.toLocaleString("pt-BR"));

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
  const detalhe = await montarDetalheDaLoja(slug, { atualizar: bruto.atualizar === "1" });

  // Plataforma configurada e respondendo, e a loja não existe lá: 404 de
  // verdade. Sem token ou com a plataforma fora do ar, a tela explica em vez
  // de dizer que a loja não existe — são coisas diferentes.
  if (detalhe.configurado && !detalhe.ficha && detalhe.falhas.some((f) => f.includes("não encontrada"))) {
    notFound();
  }

  const ficha = detalhe.ficha;
  const dono = ehDono(admin.role);
  const base = `/lojas/${slug}`;

  // Tudo sobre o catálogo INTEIRO, antes da paginação: filtrar, ordenar, contar.
  const resumo = resumirCatalogo(detalhe.produtos);
  const { categorias, marcas } = facetas(detalhe.produtos);
  const filtrados = filtrarCatalogo(detalhe.produtos, consulta);
  const ordenados = ordenarCatalogo(filtrados, consulta.ordem, consulta.grupo);
  const pagina = paginarCatalogo(ordenados, consulta.pagina, consulta.por);
  const grupos = agruparPagina(ordenados, pagina.itens, consulta.grupo);
  const temEstoque = resumo.controlamEstoque > 0;
  const comFiltro = filtrosAtivos(consulta) > 0;

  const ir = (mudanca: Partial<Consulta>) => enderecoDaConsulta(base, consulta, mudanca);
  // A ficha do produto recebe a MESMA consulta da lista (filtros, ordem,
  // página) e monta sozinha o caminho de volta, até a linha do produto.
  const consultaNoEndereco = enderecoDaConsulta("", { ...consulta, pagina: pagina.pagina });
  const fichaDoProduto = (produto: ProdutoResumido) => `${base}/produtos/${produto.id}${consultaNoEndereco}`;

  const indicadores: { pendencia: Pendencia; rotulo: string; total: number; regra: string }[] = [
    { pendencia: "sem-foto", rotulo: "Sem foto", total: resumo.semFoto, regra: "ativos com nenhuma imagem" },
    { pendencia: "sob-consulta", rotulo: "Sem preço", total: resumo.sobConsulta, regra: "ativos com preço zero: a vitrine mostra “sob consulta”" },
    ...(temEstoque
      ? [{ pendencia: "anuncia-sem-saldo" as const, rotulo: "Anuncia sem saldo", total: resumo.anunciaSemSaldo, regra: "ativos marcados “em estoque” com contagem zerada" }]
      : []),
    { pendencia: "foto-de-outro", rotulo: "Foto de outro item", total: resumo.fotoDeOutroItem, regra: "ativos com foto declarada como representativa ou ilustração" },
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
            <summary>Gerenciar assinatura</summary>
            <div>
              <p>
                A mensalidade pertence à <strong>loja</strong> e mora na plataforma de lojas (plano {rotuloDoPlano(ficha.plano)}
                ). Quem cobra é o Mercado Pago: criar a mensalidade gera o link de cartão, e ela só passa a cobrar depois que
                o lojista cadastra o cartão. Pagamento confirmado chega pelo aviso do Mercado Pago — nada aqui marca
                cobrança como paga.
              </p>
              {!dono ? (
                <p>Só o dono da conta cria, altera ou cancela mensalidade.</p>
              ) : ficha.cobrancaIsenta ? (
                <p>
                  Esta loja está marcada como isenta: é cobrada por fora da plataforma, e criar a mensalidade aqui faria o
                  cliente pagar duas vezes. A isenção é tirada na plataforma de lojas.
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
              <p>
                <Link className="text-link" href="/financeiro/mercadopago">
                  Ver todas as mensalidades e recebimentos
                </Link>
              </p>
            </div>
          </details>
        </section>
      )}

      {!detalhe.catalogoLido ? (
        // Falha de leitura não é catálogo vazio, e nenhum indicador vira zero por causa dela.
        <EstadoVazio
          compacto
          titulo="Não consegui ler o catálogo"
          descricao="A plataforma de lojas não respondeu a esta leitura. Nenhum número é mostrado: zero aqui seria mentira."
          acao={{ label: "Tentar de novo", href: `${enderecoDaConsulta(base, consulta)}${comFiltro || consulta.pagina > 1 ? "&" : "?"}atualizar=1` }}
        />
      ) : (
        <>
          <section className="catalogo-indicadores" aria-label="Catálogo inteiro da loja">
            <header>
              <h2>Catálogo</h2>
              <p>
                {contar(resumo.total, "produto", "produtos")} na loja
                {detalhe.catalogoLidoEm ? ` · lido em ${formatDateTime(detalhe.catalogoLidoEm)}` : ""}
                {" · "}
                <a className="text-link" href={`${ir({})}${ir({}).includes("?") ? "&" : "?"}atualizar=1`}>
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
                  Fonte: plataforma de lojas, <code>GET /api/admin/tenants/{slug}/produtos?resumo=1</code>, guardada por até
                  um minuto neste painel. São contagens: não se editam aqui, mudam quando o produto muda na loja.
                </li>
                <li>Ativos e inativos: o campo “ativo” do produto. Inativo não aparece na vitrine; não é loja fora do ar.</li>
                {indicadores.map((i) => (
                  <li key={i.pendencia}>
                    {i.rotulo}: {i.regra}.
                  </li>
                ))}
                <li>
                  {temEstoque
                    ? `Estoque: ${contar(resumo.controlamEstoque, "produto controla", "produtos controlam")} estoque; nos demais a contagem é “não controla”, que não é zero.`
                    : "Estoque: nenhum produto desta loja controla estoque, então não há indicador nem filtro de estoque."}
                </li>
              </ul>
            </details>
          </section>

          <FiltrosDoCatalogo base={base} consulta={consulta} categorias={categorias} marcas={marcas} temEstoque={temEstoque} />

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
                                <Link href={fichaDoProduto(produto)}>{produto.nome}</Link>
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
                                <Link className="text-button" href={fichaDoProduto(produto)} aria-label={`Abrir ${produto.nome}`}>
                                  Abrir
                                </Link>
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
                                <Link className="secondary-button" href={fichaDoProduto(produto)}>
                                  Abrir produto
                                </Link>
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
