import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CabecalhoTela from "@/components/sistema/CabecalhoTela";
import { Grupo, LinhaInfo, LinhaLink } from "@/components/sistema/Lista";
import Status from "@/components/sistema/Status";
import { ehDono, getAdmin } from "@/lib/auth";
import { duracaoLegivel, lerAutomacoes, quandoFoi, type StatusExecucao } from "@/lib/n8n-operacao";

export const dynamic = "force-dynamic";

const FILTROS: { chave: string; rotulo: string }[] = [
  { chave: "", rotulo: "Todas" },
  { chave: "error", rotulo: "Com erro" },
  { chave: "success", rotulo: "Concluídas" },
];

function tomDoStatus(status: StatusExecucao) {
  if (status === "error") return "vermelho" as const;
  if (status === "running" || status === "waiting") return "amarelo" as const;
  return "azul" as const;
}

/**
 * Execuções do n8n, com erro em primeiro lugar.
 *
 * O filtro vive na URL (`?status=error&fluxo=<id>`), como no SEO: dá para
 * mandar o link de "o que falhou hoje" para alguém sem pedir que refaça os
 * cliques. A lista mostra a última página da API; o histórico completo mora
 * no n8n, a um toque de distância em cada linha.
 */
export default async function ExecucoesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; fluxo?: string }>;
}) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  if (!ehDono(admin.role)) redirect("/operacao");

  const { status: statusFiltro = "", fluxo: fluxoFiltro = "" } = await searchParams;
  const dados = await lerAutomacoes(150);
  // A idade é contada a partir do instante da leitura, não do render.
  const agora = new Date(dados.lidoEm).getTime();

  const fluxo = fluxoFiltro ? dados.fluxos.find((f) => f.id === fluxoFiltro) ?? null : null;
  const execucoes = dados.execucoes.filter((execucao) => {
    if (fluxoFiltro && execucao.fluxoId !== fluxoFiltro) return false;
    if (statusFiltro && execucao.status !== statusFiltro) return false;
    return true;
  });

  const parametros = (chave: string) => {
    const busca = new URLSearchParams();
    if (chave) busca.set("status", chave);
    if (fluxoFiltro) busca.set("fluxo", fluxoFiltro);
    const texto = busca.toString();
    return texto ? `/operacao/automacoes/execucoes?${texto}` : "/operacao/automacoes/execucoes";
  };

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="automacoes">
      <CabecalhoTela
        titulo="Execuções"
        descricao={fluxo ? `Rodadas de ${fluxo.nome}.` : "As rodadas mais recentes de todos os fluxos."}
        icone="operacao"
        voltar={{ href: "/operacao/automacoes", rotulo: "Voltar para Automações" }}
        acoes={
          fluxo ? (
            <a className="secondary-button" href={fluxo.url} target="_blank" rel="noreferrer">
              Abrir fluxo no n8n
            </a>
          ) : undefined
        }
      />

      {!dados.conectado ? (
        <Grupo titulo="Sem conexão com o n8n">
          <LinhaInfo titulo="Não consegui ler as execuções" descricao={dados.motivo ?? "Motivo não informado."} icone="automacoes" tom="neutro" />
        </Grupo>
      ) : (
        <div className="pilha">
          <nav className="chip-group" aria-label="Filtrar por situação">
            {FILTROS.map((filtro) => (
              <Link
                key={filtro.chave || "todas"}
                href={parametros(filtro.chave)}
                className="chip-toggle"
                aria-pressed={statusFiltro === filtro.chave}
              >
                {filtro.rotulo}
              </Link>
            ))}
            {fluxoFiltro ? (
              <Link href={statusFiltro ? `/operacao/automacoes/execucoes?status=${statusFiltro}` : "/operacao/automacoes/execucoes"} className="chip-toggle">
                Todos os fluxos
              </Link>
            ) : null}
          </nav>

          <Grupo titulo={`${execucoes.length} execuç${execucoes.length === 1 ? "ão" : "ões"}`}>
            {execucoes.length === 0 ? (
              <LinhaInfo
                titulo="Nada nesta janela"
                descricao="A API do n8n devolve as execuções mais recentes; ajuste o filtro ou veja o histórico completo no n8n."
                icone="operacao"
                tom="neutro"
              />
            ) : (
              execucoes.map((execucao) => (
                <LinhaLink
                  key={execucao.id}
                  href={`${fluxo?.url ?? `${dados.base.replace("/api/v1", "")}/workflow/${execucao.fluxoId}`}/executions/${execucao.id}`}
                  titulo={execucao.fluxo}
                  descricao={`${quandoFoi(execucao.inicio, agora)} · ${duracaoLegivel(execucao.duracaoMs)} · ${execucao.modo}`}
                  icone="automacoes"
                  tom={tomDoStatus(execucao.status)}
                  valor={<Status status={execucao.status} />}
                />
              ))
            )}
          </Grupo>

          <p className="home-rodape">
            Lido da API do n8n em {new Date(dados.lidoEm).toLocaleString("pt-BR")}. O histórico completo fica no n8n.
          </p>
        </div>
      )}
    </AppShell>
  );
}
