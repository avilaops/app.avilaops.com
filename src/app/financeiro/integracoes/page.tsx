import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import DiagnosticoIntegracao from "@/components/integracoes/DiagnosticoIntegracao";
import EventosRecentes from "@/components/whatsapp/EventosRecentes";
import { ehDono, getAdmin } from "@/lib/auth";
import { eventosDoProvedor, pagamentosRecentes, resumoRecebiveis } from "@/lib/integracoes";

/**
 * Painel de integrações: saúde dos webhooks, eventos recebidos e recebíveis —
 * tudo que antes só dava para ver por SSH, agora num lugar só. Só do dono, como
 * o resto do financeiro.
 */
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default async function IntegracoesPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  if (!ehDono(admin.role)) redirect("/operacao");

  const lidoEm = new Date().toISOString();
  const [paypal, mercadopago, whatsapp, recebiveis, pagamentos] = await Promise.all([
    eventosDoProvedor("paypal"),
    eventosDoProvedor("mercadopago"),
    eventosDoProvedor("whatsapp_business"),
    resumoRecebiveis(),
    pagamentosRecentes(),
  ]);

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="overview">
      <header className="page-header">
        <div>
          <h1>Integrações</h1>
          <p>Saúde dos webhooks, eventos recebidos e recebíveis — num lugar só.</p>
        </div>
        <div className="page-header-actions">
          <Link href="/financeiro" className="secondary-button">Voltar ao financeiro</Link>
        </div>
      </header>

      <div className="flex flex-col gap-4">
        <DiagnosticoIntegracao titulo="PayPal" endpoint="/api/integracoes/paypal/diagnostico" />
        <DiagnosticoIntegracao titulo="Mercado Pago" endpoint="/api/integracoes/mercadopago/diagnostico" />

        <section className="w-full rounded-xl border border-border bg-card p-4">
          <h2 className="text-[15px] font-semibold text-foreground">Recebíveis</h2>
          {recebiveis.length === 0 ? (
            <p className="mt-1 text-[13px] text-muted-foreground">Nada em aberto.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {recebiveis.map((r) => (
                <li key={r.status} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="text-muted-foreground">{r.status}</span>
                  <strong className="text-foreground">{r.quantidade} · {brl.format(r.total)}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="w-full rounded-xl border border-border bg-card p-4">
          <h2 className="text-[15px] font-semibold text-foreground">Pagamentos recebidos</h2>
          {pagamentos.length === 0 ? (
            <p className="mt-1 text-[13px] text-muted-foreground">Nenhum pagamento registrado no ledger ainda.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {pagamentos.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="text-muted-foreground">{p.provider} · {p.status}</span>
                  <span className="flex items-center gap-3">
                    <strong className="text-foreground">
                      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: p.currency }).format(p.amount)}
                    </strong>
                    <span className="text-[13px] text-muted-foreground">
                      {p.paidAt ? new Date(p.paidAt).toLocaleDateString("pt-BR") : "—"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="w-full">
          <h2 className="mb-2 text-[15px] font-semibold text-foreground">PayPal</h2>
          <EventosRecentes eventos={paypal} lidoEm={lidoEm} />
        </section>

        <section className="w-full">
          <h2 className="mb-2 text-[15px] font-semibold text-foreground">Mercado Pago</h2>
          <EventosRecentes eventos={mercadopago} lidoEm={lidoEm} />
        </section>

        <section className="w-full">
          <h2 className="mb-2 text-[15px] font-semibold text-foreground">WhatsApp</h2>
          <EventosRecentes eventos={whatsapp} lidoEm={lidoEm} />
        </section>
      </div>
    </AppShell>
  );
}
