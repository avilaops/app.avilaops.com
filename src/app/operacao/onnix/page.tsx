import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CabecalhoTela from "@/components/sistema/CabecalhoTela";
import { Grupo, LinhaInfo } from "@/components/sistema/Lista";
import { ehDono, getAdmin } from "@/lib/auth";
import { contextoDaSecao } from "@/lib/navegacao";
import { fetchOnnixSnapshot } from "@/lib/onnix";

export const dynamic = "force-dynamic";

function dimensions(value: number[] | undefined): string {
  return value?.length === 2 ? `${value[0]} × ${value[1]} px` : "Não informado";
}

export default async function OnnixOperationsPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  if (!ehDono(admin.role)) redirect("/operacao");
  const { status, evidence } = await fetchOnnixSnapshot();
  const evaluation = evidence?.available ? evidence.evaluation : undefined;
  const measuredAt = evidence?.createdAt ? Date.parse(evidence.createdAt) : NaN;
  const stale = evidence?.stale === true;
  const stateLabel = status === "unconfigured" ? "Conexão não configurada" :
    status === "unavailable" ? "Experiments indisponível" :
    !evidence?.available ? "Sem evidência" :
    stale || evidence.stale ? "Medição desatualizada" :
    evaluation?.verdict === "passed" ? "Avaliação aprovada" : "Avaliação em atenção";

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="onnix">
      <CabecalhoTela
        titulo="ONNIX · Inferência e evidências"
        descricao="Resultados reais da inferência CPU recebidos do Ávila Experiments. Sem acesso aos segredos do worker."
        {...contextoDaSecao("onnix")}
      />
      <div className="home-grid">
        <div className="pilha">
          <Grupo titulo="Estado do ONNIX">
            <LinhaInfo titulo="Última avaliação" descricao="Coleta sintética 64 × 64 pixels, executada no worker existente" icone="saude" valor={stateLabel}/>
            <LinhaInfo titulo="Execução" descricao="Data registrada no laboratório" valor={Number.isFinite(measuredAt) ? new Date(measuredAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Sem registro"}/>
            <LinhaInfo titulo="Provedor" valor={evidence?.provider ?? "Não informado"}/>
            <LinhaInfo titulo="Latência observada" descricao="Uma execução isolada, não é benchmark estatístico" valor={evaluation?.latencyMs === undefined ? "Não medida" : `${evaluation.latencyMs.toLocaleString("pt-BR")} ms`}/>
          </Grupo>
          <Grupo titulo="Evidências">
            <LinhaInfo titulo="Entrada" valor={dimensions(evaluation?.inputPixels)}/>
            <LinhaInfo titulo="Saída" valor={dimensions(evaluation?.outputPixels)}/>
            <LinhaInfo titulo="Formato" valor={evaluation?.outputFormat ?? "Não informado"}/>
            <LinhaInfo titulo="Modelo (SHA-256)" descricao={evidence?.modelSha256 ?? "Sem hash disponível"}/>
          </Grupo>
        </div>
        <div className="pilha">
          <Grupo titulo="Integração">
            <LinhaInfo titulo="Origem" descricao="API privada do Experiments; nenhuma imagem ou token é enviado ao navegador" icone="infra" valor="Leitura"/>
            <LinhaInfo titulo="Atualização" descricao="Nova coleta no worker conforme timer do Experiments; recarregue a página para consultar o último resultado" valor="Sem cache"/>
          </Grupo>
          <Grupo titulo="Laboratório">
            <div className="linha linha-estatica">
              <div className="linha-texto">
                <strong>Ávila Experiments</strong>
                <small>Histórico completo e análises no laboratório autenticado.</small>
                <Link href="https://ml.avilaops.com/experiments/" className="text-link">Abrir laboratório</Link>
              </div>
            </div>
          </Grupo>
        </div>
      </div>
    </AppShell>
  );
}
