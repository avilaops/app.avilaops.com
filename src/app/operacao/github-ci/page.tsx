import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CabecalhoTela from "@/components/sistema/CabecalhoTela";
import { Grupo, LinhaInfo } from "@/components/sistema/Lista";
import { ehDono, getAdmin } from "@/lib/auth";
import { contextoDaSecao } from "@/lib/navegacao";
import { fetchGithubCiSnapshot } from "@/lib/github-ci";

export const dynamic = "force-dynamic";

function label(status: string | null | undefined): string {
  switch (status) {
    case "success": return "Concluído com sucesso";
    case "failure": return "Falhou";
    case "skipped": return "Ignorado — não aprovado";
    case "cancelled": return "Cancelado";
    case "in_progress": return "Executando";
    case "queued": return "Na fila";
    case "completed": return "Concluído sem decisão";
    default: return status ?? "Não medido";
  }
}

export default async function GithubCiCentralPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  if (!ehDono(admin.role)) redirect("/operacao");
  const result = await fetchGithubCiSnapshot();
  const evidence = result.data;
  const projects = evidence?.projects ?? [];
  const stale = evidence?.stale === true;
  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="github-ci">
      <CabecalhoTela
        titulo="GitHub Actions · MLOps"
        descricao="Evidências verificadas por repositório, workflow e commit, coletadas pelo Experiments."
        {...contextoDaSecao("github-ci")}
      />
      <main className="mx-auto w-full max-w-5xl space-y-5 px-4 pb-12">
        <Grupo titulo="Qualidade dos dados">
          <LinhaInfo titulo="Origem" icone="infra" descricao="Experiments pela rede privada; sem token exposto ao navegador" valor="Somente leitura"/>
          <LinhaInfo titulo="Situação da coleta" valor={result.status !== "ok" ? "Indisponível" : !evidence?.available ? "Sem evidências" : stale ? "Dados desatualizados" : "Atualizado"}/>
          <LinhaInfo titulo="Última coleta" valor={evidence?.collectedAt ? new Date(evidence.collectedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Não informada"}/>
          <LinhaInfo titulo="Projetos monitorados" valor={evidence?.available ? String(projects.length) : "Não medido"}/>
        </Grupo>
        <div className="rounded-xl border border-border overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-muted/40"><tr>
              <th className="px-4 py-3">Projeto</th>
              <th className="px-4 py-3">Workflow</th>
              <th className="px-4 py-3">Commit</th>
              <th className="px-4 py-3">Resultado informado</th>
            </tr></thead>
            <tbody>
              {projects.map(project => {
                const run = project.latestRuns?.[0];
                return <tr className="border-t border-border" key={project.repository}>
                  <td className="px-4 py-3 font-medium">{project.repository.replace("avilaops/","")}</td>
                  <td className="px-4 py-3">{run ? <a href={run.url} target="_blank" rel="noopener noreferrer" className="text-link">{run.name}</a> : project.available ? "Sem execução" : "Indisponível"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{run?.sourceSha.slice(0,12) ?? "—"}</td>
                  <td className="px-4 py-3">{stale ? "Dados antigos" : run ? label(run.status === "completed" ? run.conclusion : run.status) : "Não medido"}</td>
                </tr>;
              })}
              {projects.length === 0 && <tr><td colSpan={4} className="px-4 py-6">Nenhuma coleta válida disponível.</td></tr>}
            </tbody>
          </table>
        </div>
        <section className="rounded-xl border border-border p-4 text-sm">
          <h2 className="font-semibold">Interpretação das evidências</h2>
          <p className="mt-2 text-muted-foreground">Um workflow marcado como sucesso não comprova aprovação humana, testes individuais, desempenho de modelos, qualidade de IA nem saúde pós-deploy. Estados ignorados, falhos ou desatualizados nunca são tratados como aprovação.</p>
          <p className="mt-3"><Link className="text-link" href="/operacao/onnix">Consultar ONNIX</Link> · <a className="text-link" href="https://ml.avilaops.com/experiments/" target="_blank" rel="noopener noreferrer">Abrir Experiments</a></p>
        </section>
      </main>
    </AppShell>
  );
}
