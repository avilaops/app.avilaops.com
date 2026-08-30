import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import NovaCobrancaForm from "@/components/NovaCobrancaForm";
import { ehDono, getAdmin } from "@/lib/auth";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { listarLinksPagamento } from "@/lib/mercadopago";

export const dynamic = "force-dynamic";

export default async function CobrarPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  // Dinheiro, segredo e acesso são do dono: a equipe opera o resto.
  if (!ehDono(admin.role)) redirect("/operacao");

  const links = await listarLinksPagamento(20).catch(() => []);

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="mercadopago">
      <header className="page-header">
        <div>
          <span className="eyebrow">
            <Link href="/financeiro/mercadopago">Mercado Pago</Link> · Cobrança avulsa
          </span>
          <h1>Cobrar fora do plano.</h1>
          <p>
            O setup de R$ 497, um serviço combinado, uma diária extra. Cobrança única — quem paga
            escolhe PIX, cartão ou boleto na página do Mercado Pago.
          </p>
        </div>
      </header>

      <section className="mp-painel">
        <h2>Novo link</h2>
        <NovaCobrancaForm />
        <p className="mp-nota">
          Isto não é mensalidade: não salva cartão e não repete. Para mudar o que um lojista paga por
          mês, use o botão <strong>Valor</strong> na assinatura dele — some ao plano em vez de criar
          uma segunda cobrança.
        </p>
      </section>

      <section className="mp-painel" aria-label="Links criados">
        <h2>Links recentes</h2>
        {links.length === 0 ? (
          <p className="table-empty">Nenhum link criado ainda.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Criado</th>
                  <th>Descrição</th>
                  <th>Referência</th>
                  <th>Valor</th>
                  <th>Link</th>
                </tr>
              </thead>
              <tbody>
                {links.map((l) => (
                  <tr key={l.id}>
                    <td>{l.criadoEm ? formatShortDate(l.criadoEm) : "—"}</td>
                    <td>{l.titulo}</td>
                    <td>{l.referencia ?? "—"}</td>
                    <td>{l.valorCentavos ? formatCurrency(l.valorCentavos / 100) : "—"}</td>
                    <td>
                      {l.link ? (
                        <a href={l.link} target="_blank" rel="noopener">
                          abrir
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mp-nota">
          Um link criado não expira sozinho e pode ser pago mais de uma vez. Para cobrança que não
          pode repetir, use uma referência única e confira o recebimento na visão geral.
        </p>
      </section>
    </AppShell>
  );
}
