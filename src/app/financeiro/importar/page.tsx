import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import WiseImportPanel from "@/components/WiseImportPanel";
import { ehDono, getAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export default async function ImportarPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  // Dinheiro, segredo e acesso são do dono: a equipe opera o resto.
  if (!ehDono(admin.role)) redirect("/operacao");

  const accounts = await prisma.bankAccount.findMany({
    where: { provider: "wise" },
    orderBy: { currency: "asc" },
    include: {
      _count: { select: { transactions: true } },
    },
  });

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="import">
      <header className="page-header">
        <div>
          <h1>Importar extrato</h1>
          <p>A Wise não abre API para conta pessoal: o extrato entra por arquivo e cai na mesma fila de conciliação.</p>
        </div>
      </header>

      <section className="section-panel">
        <WiseImportPanel />
      </section>

      {accounts.length > 0 ? (
        <section className="section-panel">
          <div className="section-heading">
            <div>
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

    </AppShell>
  );
}
