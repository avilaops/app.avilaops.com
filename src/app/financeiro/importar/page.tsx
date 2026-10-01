import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CabecalhoFinanceiro from "@/components/financeiro/CabecalhoFinanceiro";
import Painel from "@/components/financeiro/Painel";
import { contextoDaSecao } from "@/lib/navegacao";

import WiseImportPanel from "@/components/WiseImportPanel";
import { ehDono, getAdmin } from "@/lib/auth";
import { contar, formatDateTime } from "@/lib/format";
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
      <CabecalhoFinanceiro
        titulo="Importar extrato"
        descricao="Selecione um extrato da Wise para importar as movimentações e revisá-las na fila de conciliação."
        voltar={contextoDaSecao("import").voltar}
        acoes={[]}
      />

      <Painel titulo="Wise">
        <WiseImportPanel />
      </Painel>

      {accounts.length > 0 ? (
        <Painel titulo="O que já entrou">
          <ul className="m-0 list-none p-0">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-border py-2.5 last:border-b-0"
              >
                <strong className="text-[15px] font-semibold text-foreground">{account.displayName}</strong>
                <span className="text-[13px] text-muted-foreground">
                  {contar(account._count.transactions, "movimentação", "movimentações")} · última importação{" "}
                  {account.lastSyncAt ? formatDateTime(account.lastSyncAt) : "nunca"}
                </span>
              </li>
            ))}
          </ul>
        </Painel>
      ) : null}
    </AppShell>
  );
}
