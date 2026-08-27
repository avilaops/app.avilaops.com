import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import WiseImportPanel from "@/components/WiseImportPanel";
import { getAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export default async function ImportarPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const accounts = await prisma.bankAccount.findMany({
    where: { provider: "wise" },
    orderBy: { currency: "asc" },
    include: {
      _count: { select: { transactions: true } },
    },
  });

  return (
    <AppShell adminName={admin.nome} section="import">
      <header className="page-header">
        <div>
          <span className="eyebrow">Control room · Financeiro</span>
          <h1>Importar extrato da Wise.</h1>
          <p>
            O Éfi entra sozinho pela API. A Wise não abre API para conta
            pessoal, então o extrato entra por arquivo — e vira a mesma
            movimentação, na mesma fila de conciliação.
          </p>
        </div>
      </header>

      <section className="section-panel">
        <WiseImportPanel />
      </section>

      {accounts.length > 0 ? (
        <section className="section-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Contas Wise</span>
              <h2>O que já entrou</h2>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Conta</th>
                  <th>Moeda</th>
                  <th>Movimentações</th>
                  <th>Última importação</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td>
                      <strong>{account.displayName}</strong>
                    </td>
                    <td>{account.currency}</td>
                    <td>{account._count.transactions}</td>
                    <td>{formatDateTime(account.lastSyncAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="section-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Como o arquivo é lido</span>
            <h2>O que o importador faz com cada linha</h2>
          </div>
        </div>
        <dl className="health-list import-legend">
          <div>
            <dt>Uma conta por moeda</dt>
            <dd>
              BRL, EUR e USD viram contas separadas. Somar moedas diferentes
              produziria um saldo que não existe.
            </dd>
          </div>
          <div>
            <dt>Conversão de saldo</dt>
            <dd>
              Vira duas linhas — saída numa moeda, entrada na outra — marcadas
              como &ldquo;entre contas&rdquo; e fora do resultado.
            </dd>
          </div>
          <div>
            <dt>Compra estornada</dt>
            <dd>Entra no extrato já ignorada: o valor voltou, não é despesa.</dd>
          </div>
          <div>
            <dt>Transferência cancelada</dt>
            <dd>Descartada, com o motivo no relatório da importação.</dd>
          </div>
          <div>
            <dt>Escopo</dt>
            <dd>
              Fornecedor de operação vira Empresa, categoria de vida vira
              Pessoal, e o que a regra não reconhece fica &ldquo;a
              classificar&rdquo;.
            </dd>
          </div>
          <div>
            <dt>Reimportação</dt>
            <dd>
              Atualiza a linha existente e preserva escopo marcado à mão e
              conciliação já resolvida.
            </dd>
          </div>
        </dl>
      </section>
    </AppShell>
  );
}
