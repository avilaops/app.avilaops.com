import Link from "next/link";
import { redirect } from "next/navigation";
import CabecalhoPagina from "@/components/hub-social/CabecalhoPagina";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import BotaoEvidencia from "@/components/hub-social/FolhaEvidencia";
import GradeMetricas, { Metrica } from "@/components/hub-social/Metricas";
import TabelaResponsiva from "@/components/hub-social/TabelaResponsiva";
import VincularCliente from "@/components/lojas/VincularCliente";
import { Grupo, LinhaDobravel, LinhaLink } from "@/components/sistema/Lista";
import BadgeStatus from "@/components/sistema/Status";
import { getAdmin } from "@/lib/auth";
import { contar, formatDateTime, formatShortDate } from "@/lib/format";
import {
  agruparPorFaixa,
  alertasDaLoja,
  duracaoLegivel,
  enderecoDaLoja,
  evidenciaDaPlataforma,
  faixaDaLoja,
  filtrarLojas,
  ordenarRotinas,
  proximaLegivel,
  resumirLojas,
  resumirRotinas,
  rotuloDoPlano,
  situacaoDaRotina,
  sugerirCliente,
  tituloDaRotina,
  tomDaRotina,
  type LojaNoPainel,
} from "@/lib/lojas-painel";
import { montarPainelDeLojas } from "@/lib/lojas-servidor";

export const dynamic = "force-dynamic";

const CAMINHO = "/api/admin/tenants";
const CAMINHO_ROTINAS = "/api/admin/rotinas";

/** Se o bloco tem estados diferentes dentro — senão o selo é redundante. */
function variosEstados(lojas: LojaNoPainel[]): boolean {
  return new Set(lojas.map((l) => l.status)).size > 1;
}

/** Cor do quadradinho: vermelho pede gente, amarelo pede olhada, azul está em paz. */
function tomDaLoja(loja: LojaNoPainel, agora: Date): "vermelho" | "amarelo" | "azul" {
  const alertas = alertasDaLoja(loja, agora);
  if (alertas.some((a) => a.gravidade === "erro")) return "vermelho";
  return alertas.length > 0 ? "amarelo" : "azul";
}

export default async function LojasPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const painel = await montarPainelDeLojas();
  const agora = new Date(painel.lidoEm);
  const resumo = resumirLojas(painel.lojas, agora);
  const rotinas = resumirRotinas(painel.rotinas);

  const busca = ((await searchParams).q ?? "").trim();
  const visiveis = filtrarLojas(painel.lojas, busca);
  const blocos = agruparPorFaixa(visiveis, agora);

  const ordenadas = [...visiveis].sort((a, b) => {
    const peso = (l: LojaNoPainel) => (faixaDaLoja(l, agora) === "atencao" ? 0 : 1);
    return peso(a) - peso(b) || a.nome.localeCompare(b.nome, "pt-BR");
  });

  const evidencia = (rotulo: string, formula: string, bruto: unknown) =>
    evidenciaDaPlataforma(rotulo, {
      formula,
      lidoEm: painel.lidoEm,
      bruto,
      caminho: CAMINHO,
      funcao: "listarLojas()",
    });

  /** O vínculo é decisão de gente: a tela oferece o palpite, nunca o grava. */
  const acaoDeVincular = (loja: LojaNoPainel) =>
    loja.cliente ? null : (
      <VincularCliente
        slug={loja.slug}
        nomeDaLoja={loja.nome}
        sugestao={sugerirCliente(loja, painel.clientes)}
        clientes={painel.clientes}
      />
    );

  return (
    <>
      <CabecalhoPagina
        titulo="Lojas"
        subtitulo="As vitrines dos clientes na plataforma lojas.avilaops.com, com o catálogo de cada uma."
      />

      {!painel.configurado && (
        <section className="mp-alerta">
          <h2>Plataforma de lojas não configurada</h2>
          <p>
            Falta <code>LOJAS_ADMIN_TOKEN</code> no ambiente deste app. Sem ele esta tela não lê nada —
            as lojas continuam no ar normalmente, quem não enxerga é o Ávila OS.
          </p>
        </section>
      )}

      {painel.falhas.length > 0 && (
        <section className="mp-alerta" aria-label="Falhas de leitura">
          <h2>Nem tudo carregou</h2>
          <ul>
            {painel.falhas.map((falha) => (
              <li key={falha}>{falha}</li>
            ))}
          </ul>
          <p>O resto da tela mostra o que deu para ler — não é a foto completa.</p>
        </section>
      )}

      {painel.configurado && (
        <>
          {/* No desktop a tabela não tem cabeçalho de bloco, então os quatro
              números moram aqui. No celular, "No ar" e "Precisam de gente"
              viram título de seção na lista, com a mesma evidência — repetir
              os dois empurrava a primeira loja para fora da primeira tela. */}
          <GradeMetricas rotulo="Resumo das lojas">
            <div className="metrica-oculta-no-celular">
              <Metrica
                rotulo="No ar"
                valor={resumo.noAr}
                detalhe={`de ${contar(resumo.total, "loja", "lojas")} na plataforma`}
                tom={resumo.noAr > 0 ? "bom" : "neutro"}
                evidencia={evidencia("Lojas no ar", 'lojas com status "ATIVA" na resposta da plataforma', {
                  total: resumo.total,
                  noAr: resumo.noAr,
                  configurando: resumo.configurando,
                })}
              />
            </div>
            <div className="metrica-oculta-no-celular">
              <Metrica
                rotulo="Precisam de gente"
                valor={resumo.comProblema}
                detalhe="suspensa, no ar sem catálogo ou provisionamento parado"
                tom={resumo.comProblema > 0 ? "ruim" : "bom"}
                evidencia={evidencia(
                  "Lojas com problema",
                  "lojas com ao menos um alerta de gravidade erro em alertasDaLoja()",
                  painel.lojas
                    .map((l) => ({ slug: l.slug, alertas: alertasDaLoja(l, agora) }))
                    .filter((l) => l.alertas.some((a) => a.gravidade === "erro")),
                )}
              />
            </div>
            <Metrica
              rotulo="Produtos publicados"
              valor={resumo.produtos.toLocaleString("pt-BR")}
              detalhe="somando o catálogo de todas as lojas"
              evidencia={evidencia(
                "Produtos publicados",
                "soma de _count.produtos de cada loja, contado pela própria plataforma",
                painel.lojas.map((l) => ({ slug: l.slug, produtos: l._count.produtos })),
              )}
            />
            <Metrica
              rotulo="Pedidos"
              valor={resumo.pedidos.toLocaleString("pt-BR")}
              detalhe="desde que cada loja subiu"
              evidencia={evidencia(
                "Pedidos",
                "soma de _count.pedidos de cada loja, contado pela própria plataforma",
                painel.lojas.map((l) => ({ slug: l.slug, pedidos: l._count.pedidos })),
              )}
            />
          </GradeMetricas>

          {painel.lojas.length > 6 || busca ? (
            <form className="barra-ferramentas" action="/lojas" role="search">
              <label className="campo-busca">
                <span className="sr-only">Buscar loja</span>
                <input type="search" name="q" defaultValue={busca} placeholder="Buscar por loja, domínio ou cliente" />
              </label>
              <button type="submit" className="secondary-button">
                Buscar
              </button>
              {busca ? (
                <Link className="text-button" href="/lojas">
                  Limpar
                </Link>
              ) : null}
            </form>
          ) : null}

          {painel.rotinas && !rotinas.agendadorLigado && (
            <section className="mp-alerta">
              <h2>O relógio da plataforma está desligado</h2>
              <p>
                O container de <code>lojas.avilaops.com</code> respondeu com <code>ROTINAS_AGENDADOR</code>{" "}
                desligado. Nada roda sozinho: a fila do Mercado Livre não vira pedido, carrinho abandonado não
                avisa ninguém e a cobrança não suspende quem deixou de pagar.
              </p>
            </section>
          )}

          {rotinas.comProblema > 0 && (
            <p className="aviso-inline">
              {contar(rotinas.comProblema, "rotina da plataforma precisa", "rotinas da plataforma precisam")} de
              gente: {rotinas.problemas.map(tituloDaRotina).join(", ")}. O detalhe está no fim desta página.
            </p>
          )}

          {resumo.semCliente > 0 && !busca && (
            <p className="aviso-inline">
              {contar(resumo.semCliente, "loja existe", "lojas existem")} na plataforma sem nenhuma ficha do
              Ávila OS que as reivindique. Cada uma traz um botão para dizer de quem é.
            </p>
          )}

          {visiveis.length === 0 ? (
            <EstadoVazio
              titulo={busca ? "Nenhuma loja com esse nome" : "Nenhuma loja na plataforma"}
              descricao={
                busca
                  ? "Nada casa com a busca — nem no nome da loja, nem no domínio, nem no cliente."
                  : "A plataforma respondeu, e não há loja cadastrada. A primeira nasce pela ficha do cliente."
              }
              acao={busca ? { label: "Limpar busca", href: "/lojas" } : { label: "Abrir clientes", href: "/clientes" }}
            />
          ) : (
            <>
              {/* No celular, uma linha por loja, agrupada pelo que ela pede.
                  O detalhe está a um toque, na página da loja.

                  Dois `div` e não um: `globals.css` entra depois do
                  `@import "tailwindcss"` e sem `@layer`, então qualquer classe
                  da folha ganha do utilitário na mesma especificidade. Com
                  `class="min-[821px]:hidden pilha"` o `display:flex` de
                  `.pilha` vencia o `display:none`, e o desktop listava cada
                  loja duas vezes — uma aqui e outra na tabela abaixo. */}
              <div className="min-[821px]:hidden">
                <div className="pilha">
                {blocos.map((bloco) => (
                  <Grupo
                    key={bloco.chave}
                    titulo={`${bloco.titulo} · ${bloco.lojas.length}`}
                    acao={
                      <BotaoEvidencia
                        evidencia={evidencia(
                          bloco.titulo,
                          `lojas em que faixaDaLoja() devolveu "${bloco.chave}"`,
                          bloco.lojas.map((l) => ({ slug: l.slug, status: l.status, alertas: alertasDaLoja(l, agora) })),
                        )}
                        rotulo={`Evidência de ${bloco.titulo}`}
                      />
                    }
                  >
                    {bloco.lojas.map((loja) => {
                      const alertas = alertasDaLoja(loja, agora);
                      const pior = alertas.find((a) => a.gravidade === "erro") ?? alertas[0];
                      return (
                        <LinhaLink
                          key={loja.slug}
                          href={`/lojas/${loja.slug}`}
                          icone="lojas"
                          tom={tomDaLoja(loja, agora)}
                          titulo={loja.nome}
                          descricao={
                            pior
                              ? `${pior.titulo}${alertas.length > 1 ? ` · +${alertas.length - 1}` : ""}`
                              : `${loja.cliente?.nome ?? "sem cliente vinculado"} · ${contar(loja._count.produtos, "produto", "produtos")}`
                          }
                          // Num bloco em que toda loja tem o mesmo estado, o
                          // selo repete o título da seção e rouba a largura
                          // do nome — "Construtora Serra Azul" virava
                          // "Construtora Serra…". Ele só aparece onde
                          // distingue uma linha da outra.
                          valor={variosEstados(bloco.lojas) ? <BadgeStatus status={loja.status} /> : undefined}
                        />
                      );
                    })}
                  </Grupo>
                ))}
                </div>
              </div>

              {/* `max-[821px]` e não `max-[820px]`: no Tailwind 4 `max-*` é
                  exclusivo (`< valor`), então o par 820/821 deixava a largura
                  de exatamente 820px sem dono — e ali a tela mostrava a lista
                  e a tabela ao mesmo tempo. 821 nos dois lados é complementar. */}
              <div className="max-[821px]:hidden">
                <TabelaResponsiva
                  rotulo="Lojas dos clientes"
                  colunas={[
                    { chave: "loja", rotulo: "Loja", principal: true },
                    { chave: "cliente", rotulo: "Cliente" },
                    { chave: "situacao", rotulo: "Situação" },
                    { chave: "atencao", rotulo: "Atenção" },
                    { chave: "produtos", rotulo: "Produtos", alinhar: "direita", mono: true },
                    { chave: "pedidos", rotulo: "Pedidos", alinhar: "direita", mono: true },
                    { chave: "desde", rotulo: "Criada em" },
                  ]}
                  linhas={ordenadas.map((loja) => {
                    const alertas = alertasDaLoja(loja, agora);
                    const pior = alertas.find((a) => a.gravidade === "erro") ?? alertas[0];
                    return {
                      id: loja.slug,
                      href: `/lojas/${loja.slug}`,
                      acao: acaoDeVincular(loja),
                      celulas: {
                        loja: (
                          <>
                            {loja.nome}
                            <span className="block font-sans text-[13px] font-normal text-muted-foreground">
                              {enderecoDaLoja(loja).replace("https://", "")} · {rotuloDoPlano(loja.plano)}
                            </span>
                          </>
                        ),
                        cliente: loja.cliente ? (
                          <Link href={`/clientes/${loja.cliente.id}`} className="text-link">
                            {loja.cliente.nome}
                          </Link>
                        ) : (
                          <span className="text-[color:var(--amber)]">sem vínculo</span>
                        ),
                        situacao: <BadgeStatus status={loja.status} />,
                        atencao: pior ? (
                          <span
                            className={
                              pior.gravidade === "erro" ? "text-[color:var(--red)]" : "text-[color:var(--amber)]"
                            }
                            title={pior.detalhe}
                          >
                            {pior.titulo}
                            {alertas.length > 1 ? ` · +${alertas.length - 1}` : ""}
                          </span>
                        ) : null,
                        produtos: loja._count.produtos.toLocaleString("pt-BR"),
                        pedidos: loja._count.pedidos.toLocaleString("pt-BR"),
                        desde: formatShortDate(loja.criadoEm),
                      },
                      evidencia: evidenciaDaPlataforma(`Loja ${loja.nome}`, {
                        formula: "linha da loja como a plataforma devolveu, mais o vínculo de cliente do Ávila OS",
                        lidoEm: painel.lidoEm,
                        bruto: { plataforma: loja, alertas },
                        caminho: CAMINHO,
                        funcao: "listarLojas()",
                      }),
                    };
                  })}
                />
              </div>
            </>
          )}

          {painel.rotinas && (
            <Grupo
              titulo={`Rotinas da plataforma · ${rotinas.emPaz} de ${rotinas.total} em paz`}
              acao={
                <BotaoEvidencia
                  evidencia={evidenciaDaPlataforma("Rotinas da plataforma", {
                    formula:
                      "resposta de GET /api/admin/rotinas. Quem decide atraso e falha é a plataforma, com a cadência e o fuso dela — esta tela lê e ordena.",
                    lidoEm: painel.lidoEm,
                    bruto: painel.rotinas,
                    caminho: CAMINHO_ROTINAS,
                    funcao: "lerRotinas()",
                  })}
                  rotulo="Evidência das rotinas da plataforma"
                />
              }
            >
              {ordenarRotinas(painel.rotinas.rotinas).map((rotina) => (
                <LinhaDobravel
                  key={rotina.nome}
                  icone="automacoes"
                  tom={tomDaRotina(rotina)}
                  titulo={tituloDaRotina(rotina)}
                  descricao={situacaoDaRotina(rotina, agora)}
                  valor={proximaLegivel(rotina, agora) ?? undefined}
                >
                  <div>
                    <span className="rotulo">Rotina</span>
                    <span className="valor font-mono">{rotina.nome}</span>
                  </div>
                  <div>
                    <span className="rotulo">Cadência</span>
                    <span className="valor">{rotina.cadencia}</span>
                  </div>
                  <div className="col-span-full">
                    <span className="rotulo">O que faz</span>
                    <span className="valor">{rotina.descricao}</span>
                  </div>
                  <div>
                    <span className="rotulo">Última execução</span>
                    <span className="valor">
                      {rotina.ultimaEm ? formatDateTime(rotina.ultimaEm) : "ainda não rodou"}
                      {duracaoLegivel(rotina.ultimaDuracaoMs) ? ` · ${duracaoLegivel(rotina.ultimaDuracaoMs)}` : ""}
                    </span>
                  </div>
                  <div>
                    <span className="rotulo">Execuções</span>
                    <span className="valor font-mono">{rotina.execucoes.toLocaleString("pt-BR")}</span>
                  </div>
                  <div>
                    <span className="rotulo">Próxima</span>
                    <span className="valor">{formatDateTime(rotina.proximaEm)}</span>
                  </div>
                  {rotina.ultimoErro ? (
                    <div className="col-span-full">
                      <span className="rotulo">Último erro</span>
                      <span className="valor font-mono text-[color:var(--red)]">{rotina.ultimoErro}</span>
                    </div>
                  ) : null}
                </LinhaDobravel>
              ))}
            </Grupo>
          )}
        </>
      )}
    </>
  );
}
