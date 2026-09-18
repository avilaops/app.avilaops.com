import Link from "next/link";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import ListaChaveValor from "@/components/hub-social/ListaChaveValor";
import GradeMetricas, { Metrica } from "@/components/hub-social/Metricas";
import { Button } from "@/components/shadcn/button";
import { CartaoLista, evidenciaConexao, tomNota } from "@/components/seo/comum";
import { P, type Audit, type Connection, type Performance } from "@/components/seo/dados";

/** Aba Resumo do domínio: notas, Core Web Vitals e até três prioridades. */

export default function ResumoDominio({
  audit,
  perf,
  auditConnection,
  lighthouseConnection,
  priorities,
  hrefDiagnostico,
  lidoEm,
}: {
  audit: Audit | undefined;
  perf: Performance | undefined;
  auditConnection: Connection;
  lighthouseConnection: Connection;
  priorities: string[];
  hrefDiagnostico: string;
  lidoEm: string;
}) {
  const score = typeof audit?.score === "number" ? audit.score : null;
  const desempenho = typeof perf?.performanceScore === "number" ? perf.performanceScore : null;

  return (
    <div className="grid gap-6 max-[820px]:gap-4 min-[821px]:grid-cols-2 min-[821px]:items-start">
      <div className="space-y-4">
        <GradeMetricas rotulo="Notas do domínio">
          <Metrica
            rotulo="Score técnico"
            valor={score !== null ? `${score}/100` : "—"}
            tom={tomNota(score, 75, 50)}
            href={hrefDiagnostico}
            evidencia={evidenciaConexao(
              "Score técnico",
              `integrationConnection provider ${P.audit}`,
              "metadata.score gravado pela última auditoria técnica do domínio",
              auditConnection,
              { lidoEm },
            )}
          />
          <Metrica
            rotulo="Desempenho"
            valor={desempenho !== null ? `${desempenho}/100` : "—"}
            tom={tomNota(desempenho, 80, 50)}
            href={hrefDiagnostico}
            evidencia={evidenciaConexao(
              "Desempenho",
              `integrationConnection provider ${P.lighthouse}`,
              "metadata.performanceScore gravado pela última medição do PageSpeed/Lighthouse",
              lighthouseConnection,
              { lidoEm },
            )}
          />
        </GradeMetricas>

        <ListaChaveValor
          titulo="Core Web Vitals"
          descricao="Última medição do PageSpeed para a página inicial."
          itens={[
            { rotulo: "Maior conteúdo (LCP)", valor: perf?.lcp, mono: true, vazio: "Sem medição" },
            { rotulo: "Estabilidade visual (CLS)", valor: perf?.cls, mono: true, vazio: "Sem medição" },
            { rotulo: "Interação (INP)", valor: perf?.inp, mono: true, vazio: "Sem medição" },
          ]}
        />
      </div>

      <CartaoLista
        titulo="Prioridades deste domínio"
        descricao="Na ordem em que devem ser resolvidas."
        acao={
          <Button asChild variant="link" className="-mr-2 min-h-11 shrink-0 px-2">
            <Link href={hrefDiagnostico}>Ver diagnóstico</Link>
          </Button>
        }
      >
        {priorities.length ? (
          <ol className="m-0 list-none p-0">
            {priorities.map((p, index) => (
              <li
                key={p}
                className="flex min-h-14 items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
              >
                <span
                  aria-hidden="true"
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[13px] font-semibold tabular-nums text-foreground"
                >
                  {index + 1}
                </span>
                <span className="text-[15px] font-medium text-foreground min-[821px]:text-sm">{p}</span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="p-4">
            <EstadoVazio
              compacto
              titulo="Nenhuma pendência prioritária."
              descricao="Os sinais disponíveis estão regulares."
              acao={{ label: "Ver diagnóstico", href: hrefDiagnostico }}
            />
          </div>
        )}
      </CartaoLista>
    </div>
  );
}
