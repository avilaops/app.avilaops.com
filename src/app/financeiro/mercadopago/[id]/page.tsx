import { notFound, redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CabecalhoTela from "@/components/sistema/CabecalhoTela";
import AcoesAssinatura from "@/components/AcoesAssinatura";
import { ehDono, getAdmin } from "@/lib/auth";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { buscarAssinatura, listarCobrancas } from "@/lib/mercadopago";
import { listarLojas } from "@/lib/lojas-plataforma";

export const dynamic = "force-dynamic";

const STATUS_ASSINATURA: Record<string, string> = {
  pending: "Aguardando cartão",
  authorized: "Ativa",
  paused: "Pausada",
  cancelled: "Cancelada",
};

/** O que o Mercado Pago chama de status na cobrança de uma assinatura. */
const STATUS_COBRANCA: Record<string, string> = {
  processed: "Processada",
  scheduled: "Agendada",
  recycling: "Tentando de novo",
  cancelled: "Cancelada",
};

export default async function AssinaturaPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  // Dinheiro, segredo e acesso são do dono: a equipe opera o resto.
  if (!ehDono(admin.role)) redirect("/operacao");
  const { id } = await params;

  const assinatura = await buscarAssinatura(id).catch(() => null);
  if (!assinatura) notFound();

  // As cobranças e a loja são complementos: se falharem, a página ainda serve.
  const [cobrancas, lojas] = await Promise.all([
    listarCobrancas(id).catch(() => []),
    listarLojas().catch(() => []),
  ]);
  const loja = lojas.find((l) => l.slug === assinatura.loja) ?? null;

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="mercadopago">
      <CabecalhoTela
        titulo={loja?.nome ?? assinatura.loja ?? "Assinatura"}
        descricao={assinatura.motivo || "Mensalidade de loja."}
        voltar={{ href: "/financeiro/mercadopago", rotulo: "Voltar para Mercado Pago" }}
        icone="financeiro"
        acoes={
          loja?.assinaturaId ? (
            <AcoesAssinatura
              slug={loja.slug}
              nome={loja.nome}
              status={assinatura.status}
              valorCentavos={assinatura.valorCentavos}
            />
          ) : null
        }
      />

      <section className="metric-grid" aria-label="Resumo da assinatura">
        <article className="metric">
          <span>No Mercado Pago</span>
          <strong>{STATUS_ASSINATURA[assinatura.status] ?? assinatura.status}</strong>
          <small>desde {formatShortDate(assinatura.criadaEm)}</small>
        </article>
        <article className="metric">
          <span>Na plataforma</span>
          <strong>{loja ? loja.status : "sem loja"}</strong>
          <small>{loja?.assinaturaStatus ?? "-"}</small>
        </article>
        <article className="metric">
          <span>Valor mensal</span>
          <strong>{formatCurrency(assinatura.valorCentavos / 100)}</strong>
          <small>{loja?.plano ?? "-"}</small>
        </article>
        <article className="metric">
          <span>Próxima cobrança</span>
          <strong>{assinatura.proximaCobranca ? formatShortDate(assinatura.proximaCobranca) : "-"}</strong>
          <small>{assinatura.pagador ?? "sem pagador"}</small>
        </article>
      </section>

      {assinatura.status === "pending" && assinatura.linkCadastroCartao && (
        <section className="mp-painel">
          <h2>Ainda sem cartão</h2>
          <p className="mp-nota">
            A assinatura existe mas nunca foi autorizada. Mande este link para o lojista cadastrar o
            cartão - enquanto ele não fizer isso, nada é cobrado.
          </p>
          <p>
            <a className="small-primary" href={assinatura.linkCadastroCartao} target="_blank" rel="noopener">
              Abrir link de cadastro
            </a>
          </p>
        </section>
      )}

      <section className="mp-painel" aria-label="Cobranças">
        <h2>Cobranças</h2>
        {cobrancas.length === 0 ? (
          <p className="table-empty">
            Nenhuma cobrança ainda. Assinatura recém-criada ou nunca autorizada não gera cobrança.
          </p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Situação</th>
                  <th>Pagamento</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {cobrancas.map((c) => (
                  <tr key={c.id}>
                    <td>{c.data ? formatShortDate(c.data) : "-"}</td>
                    <td>{STATUS_COBRANCA[c.status] ?? c.status}</td>
                    <td>
                      {c.statusPagamento ?? "-"}
                      {c.detalhe && <small>{c.detalhe}</small>}
                    </td>
                    <td>{formatCurrency(c.valorCentavos / 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mp-nota">
          É esta lista que vira Fatura no painel do lojista. Quando alguém disser que pagou e a loja
          não reconheceu, comece por aqui: se a cobrança está processada e a fatura não apareceu, o
          problema é a sincronização, não o pagamento.
        </p>
      </section>

      {loja && (
        <section className="mp-painel" aria-label="A loja">
          <h2>A loja</h2>
          <dl className="mp-dados">
            <div>
              <dt>Slug</dt>
              <dd>{loja.slug}</dd>
            </div>
            <div>
              <dt>Domínio</dt>
              <dd>{loja.dominioPrincipal ?? `${loja.slug}.lojas.avilaops.com`}</dd>
            </div>
            <div>
              <dt>Contato</dt>
              <dd>{loja.loginEmail ?? loja.emailContato ?? "-"}</dd>
            </div>
            <div>
              <dt>Catálogo</dt>
              <dd>
                {loja._count.produtos} produto(s) · {loja._count.pedidos} pedido(s)
              </dd>
            </div>
            <div>
              <dt>Último pagamento</dt>
              <dd>{loja.ultimoPagamentoEm ? formatShortDate(loja.ultimoPagamentoEm) : "nenhum"}</dd>
            </div>
            <div>
              <dt>Recusas seguidas</dt>
              <dd>{loja.tentativasFalhas}</dd>
            </div>
          </dl>
        </section>
      )}
    </AppShell>
  );
}
