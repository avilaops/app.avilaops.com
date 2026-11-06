import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CabecalhoTela from "@/components/sistema/CabecalhoTela";
import { Grupo, LinhaInfo } from "@/components/sistema/Lista";
import { ehDono, getAdmin } from "@/lib/auth";
import { contextoDaSecao } from "@/lib/navegacao";
import { releaseOverview } from "@/lib/mlops-releases";

export const dynamic = "force-dynamic";

const label = (value: "passed" | "failed" | "unknown") =>
  value === "passed" ? "Aprovado" : value === "failed" ? "Falhou" : "Não comprovado";
const gateName: Record<string, string> = {
  ci: "GitHub CI", contract: "Contratos", security: "Segurança",
  humanApproval: "Aprovação humana", deployment: "Deploy", postDeployHealth: "Health pós-deploy",
};

export default async function ReleaseGovernancePage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  if (!ehDono(admin.role)) redirect("/operacao");
  const report = await releaseOverview();
  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="mlops-releases">
      <CabecalhoTela titulo="MLOps · Validação de releases"
        descricao="Commits, evidências de CI e pendências de aprovação. Status não equivale a publicação."
        {...contextoDaSecao("mlops-releases")} />
      <main className="mx-auto w-full max-w-5xl space-y-5 px-4 pb-12">
        <p className="text-sm text-muted-foreground">
          Fonte: Ávila Experiments via conexão privada. Uma CI verde não substitui contratos,
          revisão de segurança, aprovação humana ou testes depois do deploy.
          A ausência de evidência permanece em revisão.
        </p>
        <Grupo titulo="Estado da evidência">
          <LinhaInfo titulo="Conexão com o laboratório"
            descricao={report.status === "ok" ? "Inventário lido da API autenticada" : "Não foi possível comprovar o estado do laboratório"}
            valor={report.status === "ok" ? "Conectado" : report.status === "unconfigured" ? "Não configurado" : "Indisponível"} />
          <LinhaInfo titulo="Frescor" valor={report.stale ? "Desatualizado ou indisponível" : "Atualizado"} />
          <LinhaInfo titulo="Última coleta" valor={report.collectedAt ? new Date(report.collectedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Sem registro"} />
        </Grupo>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40"><tr>
              <th className="px-4 py-3">Projeto</th><th className="px-4 py-3">Commit</th>
              <th className="px-4 py-3">CI</th><th className="px-4 py-3">Prontidão</th>
              <th className="px-4 py-3">Pendências</th>
            </tr></thead>
            <tbody>{report.items.map(item => (
              <tr key={item.repository} className="border-t border-border">
                <td className="px-4 py-3 font-semibold">{item.repository}</td>
                <td className="px-4 py-3 font-mono text-xs">{item.sourceSha?.slice(0, 12) ?? "—"}</td>
                <td className="px-4 py-3">{label(item.gates[0]!.verdict)}</td>
                <td className="px-4 py-3">{report.stale ? "Sem dado atual" : item.decision === "rejected" ? "Reprovado" : item.decision === "approved" ? "Aprovado" : "Revisão"}</td>
                <td className="px-4 py-3 text-xs">{item.gates.filter(g => g.verdict === "unknown").map(g => gateName[g.id]).join(", ") || "Nenhuma pendência não comprovada"}</td>
              </tr>
            ))}
            {report.items.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-muted-foreground">Nenhuma decisão verificável disponível.</td></tr>}
            </tbody>
          </table>
        </div>
      </main>
    </AppShell>
  );
}
