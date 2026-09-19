import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CabecalhoPagina from "@/components/hub-social/CabecalhoPagina";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import GradeMetricas, { Metrica } from "@/components/hub-social/Metricas";
import TabelaResponsiva from "@/components/hub-social/TabelaResponsiva";
import BadgeStatus from "@/components/sistema/Status";
import { getAdmin } from "@/lib/auth";
import { formatShortDate } from "@/lib/format";
import {
  alertasDaLoja,
  enderecoDaLoja,
  evidenciaDaPlataforma,
  resumirLojas,
  rotuloDoPlano,
  type LojaNoPainel,
} from "@/lib/lojas-painel";
import { montarPainelDeLojas } from "@/lib/lojas-servidor";

export const dynamic = "force-dynamic";

const CAMINHO = "/api/admin/tenants";

/** Quem precisa de gente primeiro: problema, depois atenção, depois nome. */
function ordemDaLoja(loja: LojaNoPainel, agora: Date): number {
  const alertas = alertasDaLoja(loja, agora);
  if (alertas.some((a) => a.gravidade === "erro")) return 0;
  if (alertas.length > 0) return 1;
  return 2;
}

export default async function LojasPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const painel = await montarPainelDeLojas();
  const agora = new Date(painel.lidoEm);
  const resumo = resumirLojas(painel.lojas, agora);

  const ordenadas = [...painel.lojas].sort(
    (a, b) => ordemDaLoja(a, agora) - ordemDaLoja(b, agora) || a.nome.localeCompare(b.nome, "pt-BR"),
  );

  const evidencia = (rotulo: string, formula: string, bruto: unknown) =>
    evidenciaDaPlataforma(rotulo, {
      formula,
      lidoEm: painel.lidoEm,
      bruto,
      caminho: CAMINHO,
      funcao: "listarLojas()",
    });

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="lojas">
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
          <GradeMetricas rotulo="Resumo das lojas">
            <Metrica
              rotulo="No ar"
              valor={resumo.noAr}
              detalhe={`de ${resumo.total} loja(s) na plataforma`}
              tom={resumo.noAr > 0 ? "bom" : "neutro"}
              evidencia={evidencia(
                "Lojas no ar",
                'lojas com status "ATIVA" na resposta da plataforma',
                { total: resumo.total, noAr: resumo.noAr, configurando: resumo.configurando },
              )}
            />
            <Metrica
              rotulo="Precisam de gente"
              valor={resumo.comProblema}
              detalhe="suspensa, no ar sem catálogo ou provisionamento parado"
              tom={resumo.comProblema > 0 ? "ruim" : "bom"}
              evidencia={evidencia(
                "Lojas com problema",
                "lojas com ao menos um alerta de gravidade erro em alertasDaLoja()",
                ordenadas
                  .map((l) => ({ slug: l.slug, alertas: alertasDaLoja(l, agora) }))
                  .filter((l) => l.alertas.some((a) => a.gravidade === "erro")),
              )}
            />
            <Metrica
              rotulo="Produtos publicados"
              valor={resumo.produtos.toLocaleString("pt-BR")}
              detalhe="somando o catálogo de todas as lojas"
              evidencia={evidencia(
                "Produtos publicados",
                "soma de _count.produtos de cada loja, contado pela própria plataforma",
                ordenadas.map((l) => ({ slug: l.slug, produtos: l._count.produtos })),
              )}
            />
            <Metrica
              rotulo="Pedidos"
              valor={resumo.pedidos.toLocaleString("pt-BR")}
              detalhe="desde que cada loja subiu"
              evidencia={evidencia(
                "Pedidos",
                "soma de _count.pedidos de cada loja, contado pela própria plataforma",
                ordenadas.map((l) => ({ slug: l.slug, pedidos: l._count.pedidos })),
              )}
            />
          </GradeMetricas>

          {resumo.semCliente > 0 && (
            <section className="mp-alerta" aria-label="Lojas sem cliente">
              <h2>
                {resumo.semCliente} loja(s) sem cliente vinculado
              </h2>
              <p>
                Existem na plataforma e nenhuma ficha do Ávila OS as reivindica. Vincular pela ficha do
                cliente deixa a cobrança, a entrega e o histórico no mesmo lugar.
              </p>
            </section>
          )}

          {ordenadas.length === 0 ? (
            <EstadoVazio
              titulo="Nenhuma loja na plataforma"
              descricao="A plataforma respondeu, e não há loja cadastrada. A primeira nasce pela ficha do cliente."
              acao={{ label: "Abrir clientes", href: "/clientes" }}
            />
          ) : (
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
                          pior.gravidade === "erro"
                            ? "text-[color:var(--red)]"
                            : "text-[color:var(--amber)]"
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
          )}
        </>
      )}
    </AppShell>
  );
}
