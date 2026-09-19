import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CabecalhoTela from "@/components/sistema/CabecalhoTela";
import { Grupo, LinhaInfo } from "@/components/sistema/Lista";
import { ehDono, getAdmin } from "@/lib/auth";
import { getDre, type Dre } from "@/lib/dre";
import { formatCurrency } from "@/lib/format";

export const dynamic = "force-dynamic";

const PERIODOS = [
  { meses: 1, rotulo: "Mês" },
  { meses: 3, rotulo: "3 meses" },
  { meses: 12, rotulo: "12 meses" },
];

const NOMES_DOS_MESES = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function rotuloDoMes(chave: string): string {
  const [ano, mes] = chave.split("-");
  return `${NOMES_DOS_MESES[Number(mes) - 1] ?? mes}/${ano.slice(2)}`;
}

function percentual(parte: number, total: number): string {
  if (total <= 0) return "—";
  return `${((parte / total) * 100).toFixed(1).replace(".", ",")}%`;
}

/** Linha do encadeamento do resultado: rótulo, valor e o que ela significa. */
function LinhaResultado({
  rotulo,
  valor,
  ajuda,
  destaque = false,
}: {
  rotulo: string;
  valor: number;
  ajuda: string;
  destaque?: boolean;
}) {
  return (
    <div className={destaque ? "dre-linha dre-linha-destaque" : "dre-linha"}>
      <span className="dre-linha-texto">
        <strong>{rotulo}</strong>
        <small>{ajuda}</small>
      </span>
      <span className={valor < 0 ? "dre-valor negativo" : "dre-valor"}>
        {formatCurrency(valor)}
      </span>
    </div>
  );
}

/**
 * Resultado do exercício (DRE), por competência.
 *
 * O painel do Financeiro responde caixa. Esta tela responde resultado — e as
 * duas divergem toda vez que o dinheiro anda em data diferente do fato que o
 * gerou. Aqui nenhuma linha é estimada: cada conta diz quanto veio de
 * lançamento com competência e quanto veio direto do extrato, e o que ainda
 * não tem conta aparece como linha própria em vez de ser diluído no resultado.
 */
export default async function DrePage({
  searchParams,
}: {
  searchParams: Promise<{ meses?: string }>;
}) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  // Dinheiro, segredo e acesso são do dono: a equipe opera o resto.
  if (!ehDono(admin.role)) redirect("/operacao");

  const params = await searchParams;
  const solicitado = Number.parseInt(params.meses ?? "3", 10);
  const meses = PERIODOS.some((item) => item.meses === solicitado) ? solicitado : 3;

  const agora = new Date();
  const fim = new Date(
    Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 0, 23, 59, 59),
  );
  const inicio = new Date(
    Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - (meses - 1), 1),
  );

  const dre: Dre = await getDre(inicio, fim);
  const margem = dre.receitaLiquida > 0
    ? percentual(dre.resultadoOperacional, dre.receitaLiquida)
    : "—";

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="reports">
      <CabecalhoTela
        titulo="Resultado (DRE)"
        descricao={`Por competência · ${rotuloDoMes(dre.meses[0])} a ${rotuloDoMes(dre.meses[dre.meses.length - 1])}`}
        icone="financeiro"
        acoes={
          <Link href="/financeiro" className="secondary-button">
            Painel do caixa
          </Link>
        }
      />

      {/* Mesmo gesto dos filtros do painel de caixa: quem aprendeu lá não
          precisa aprender de novo aqui. */}
      <div className="range-switch" aria-label="Período do demonstrativo">
        {PERIODOS.map((item) => (
          <Link
            key={item.meses}
            href={`/financeiro/dre?meses=${item.meses}`}
            className={item.meses === meses ? "active" : ""}
            aria-current={item.meses === meses ? "page" : undefined}
          >
            {item.rotulo}
          </Link>
        ))}
      </div>

      <div className="pilha">
        <Grupo titulo="Do faturamento ao resultado">
          <div className="dre-encadeamento">
            <LinhaResultado
              rotulo="Receita bruta"
              valor={dre.receitaBruta}
              ajuda="Tudo que a Ávila faturou no período"
            />
            <LinhaResultado
              rotulo="(−) Deduções"
              valor={-dre.deducoes}
              ajuda="Impostos sobre a receita, como o DAS"
            />
            <LinhaResultado
              rotulo="= Receita líquida"
              valor={dre.receitaLiquida}
              ajuda="O que de fato ficou do faturamento"
              destaque
            />
            <LinhaResultado
              rotulo="(−) Custos diretos"
              valor={-dre.custos}
              ajuda="O que existe porque o cliente existe: servidor, domínio, IA"
            />
            <LinhaResultado
              rotulo="= Margem bruta"
              valor={dre.margemBruta}
              ajuda="Sobra de cada real vendido, antes da estrutura"
              destaque
            />
            <LinhaResultado
              rotulo="(−) Despesas operacionais"
              valor={-dre.despesas}
              ajuda="O que existe porque a Ávila existe: contabilidade, ferramentas, pró-labore"
            />
            <LinhaResultado
              rotulo="= Resultado operacional"
              valor={dre.resultadoOperacional}
              ajuda={`Margem operacional de ${margem}. Sem imobilizado a depreciar, é o EBITDA desta casa`}
              destaque
            />
            <LinhaResultado
              rotulo="(−) Resultado financeiro"
              valor={-dre.financeiro}
              ajuda="Tarifa bancária, taxa de Pix, juros"
            />
            <LinhaResultado
              rotulo="= Resultado líquido"
              valor={dre.resultadoLiquido}
              ajuda="O que sobrou no período"
              destaque
            />
          </div>
        </Grupo>

        <Grupo titulo="De onde vem cada número">
          <LinhaInfo
            titulo="Reconhecido por competência"
            descricao="Lançamento com data de competência própria — o domínio anual vira doze parcelas, e não uma despesa só"
            valor={`${dre.cobertura.toFixed(1).replace(".", ",")}%`}
          />
          <LinhaInfo
            titulo="Reconhecido pelo extrato"
            descricao="Movimentação sem lançamento por trás, contada no dia em que o dinheiro andou. Vira competência assim que virar lançamento"
            valor={`${(100 - dre.cobertura).toFixed(1).replace(".", ",")}%`}
          />
          {dre.aClassificar !== 0 ? (
            <LinhaInfo
              titulo="Ainda sem conta"
              descricao="Fica fora do resultado até alguém dizer o que é — diluir no total seria inventar classificação"
              valor={formatCurrency(dre.aClassificar)}
            />
          ) : null}
          {dre.movimentoSocio !== 0 ? (
            <LinhaInfo
              titulo="Movimento de sócio"
              descricao="Distribuição de lucro e aporte não são despesa nem receita: andam fora do resultado"
              valor={formatCurrency(dre.movimentoSocio)}
            />
          ) : null}
        </Grupo>

        {dre.grupos
          .filter((grupo) => grupo.contas.length > 0)
          .map((grupo) => (
            <Grupo key={grupo.grupo} titulo={grupo.rotulo}>
              {grupo.contas.map((conta) => (
                <LinhaInfo
                  key={conta.conta}
                  titulo={conta.rotulo}
                  descricao={
                    conta.porCompetencia !== 0 && conta.porCaixa !== 0
                      ? `${formatCurrency(conta.porCompetencia)} por competência · ${formatCurrency(conta.porCaixa)} pelo extrato`
                      : conta.porCompetencia !== 0
                        ? "Por competência"
                        : "Pelo extrato"
                  }
                  valor={formatCurrency(conta.total)}
                />
              ))}
            </Grupo>
          ))}

        {dre.grupos.every((grupo) => grupo.contas.length === 0) ? (
          <Grupo titulo="Sem movimento no período">
            <LinhaInfo
              titulo="Nada a demonstrar"
              descricao="Nenhuma movimentação de empresa nem lançamento com competência neste intervalo."
            />
          </Grupo>
        ) : null}
      </div>
    </AppShell>
  );
}
