import { notFound } from "next/navigation";
import { lerMetricasDasLojas } from "@/lib/lojas-plataforma";
import { lerSessaoSSO } from "@/lib/sso";

export const dynamic = "force-dynamic";

const numeros = new Intl.NumberFormat("pt-BR");
const horario = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export default async function AnalisesDasLojas() {
  const subject = process.env.AVILA_ANALYTICS_ADMIN_SUB?.trim();
  if (!subject) notFound();

  const sessao = await lerSessaoSSO();
  if (sessao?.sub !== subject || sessao.email.toLowerCase() !== "admin@avilaops.com") notFound();

  const relatorio = await lerMetricasDasLojas().catch(() => null);

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Análises das lojas</h1>
        {relatorio && (
          <p className="text-sm text-muted-foreground">
            Vendas nas últimas 24 horas. Requisições e erros na janela de até {relatorio.janelaMinutos} minutos.
            Medição em {horario.format(new Date(relatorio.medidoEm))}.
            Processo iniciado em {horario.format(new Date(relatorio.processoDesde))}.
          </p>
        )}
      </header>
      {!relatorio ? (
        <p role="status">Métricas indisponíveis no momento.</p>
      ) : relatorio.lojas.length === 0 ? (
        <p>Nenhuma loja no relatório.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Métricas de vendas e operação por loja</caption>
            <thead>
              <tr className="border-b text-left">
                {["Loja", "Status", "Sessões", "Pedidos criados", "Pedidos pagos", "Conversão", "Requisições", "Erros"].map((coluna) => (
                  <th key={coluna} scope="col" className="whitespace-nowrap p-3">{coluna}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {relatorio.lojas.map(({ slug, nome, status, operacao, negocio24h }) => (
                <tr key={slug} className="border-b last:border-b-0">
                  <th scope="row" className="p-3 text-left font-medium">{nome}</th>
                  <td className="p-3">{status}</td>
                  <td className="p-3">{numeros.format(negocio24h.sessoes)}</td>
                  <td className="p-3">{numeros.format(negocio24h.pedidosCriados)}</td>
                  <td className="p-3">{numeros.format(negocio24h.pedidosPagos)}</td>
                  <td className="p-3">{negocio24h.conversao === null ? "Sem sessões" : `${numeros.format(negocio24h.conversao)}%`}</td>
                  <td className="p-3">{numeros.format(operacao.requisicoes)}</td>
                  <td className="p-3">{numeros.format(operacao.erros)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
