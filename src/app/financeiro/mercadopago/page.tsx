import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import AcoesAssinatura from "@/components/AcoesAssinatura";
import VarreduraCobrancaButton from "@/components/VarreduraCobrancaButton";
import { ehDono, getAdmin } from "@/lib/auth";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { linkDoPagamento } from "@/lib/mercadopago";
import { montarPainel, WEBHOOK_ESPERADO, type Gravidade } from "@/lib/mercadopago-painel";

export const dynamic = "force-dynamic";

const STATUS_ASSINATURA: Record<string, string> = {
  pending: "Aguardando cartão",
  authorized: "Ativa",
  paused: "Pausada",
  cancelled: "Cancelada",
};

const STATUS_LOJA: Record<string, string> = {
  PROVISIONANDO: "Configurando",
  ATIVA: "No ar",
  SUSPENSA: "Suspensa",
  CANCELADA: "Cancelada",
};

const STATUS_PAGAMENTO: Record<string, string> = {
  approved: "Aprovado",
  pending: "Pendente",
  in_process: "Em análise",
  rejected: "Recusado",
  refunded: "Estornado",
  cancelled: "Cancelado",
  charged_back: "Chargeback",
};

const classePorGravidade: Record<Gravidade, string> = {
  erro: "mp-sinal mp-sinal-erro",
  atencao: "mp-sinal mp-sinal-atencao",
  ok: "mp-sinal mp-sinal-ok",
};

export default async function MercadoPagoPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  // Dinheiro, segredo e acesso são do dono: a equipe opera o resto.
  if (!ehDono(admin.role)) redirect("/operacao");

  const painel = await montarPainel();
  const comProblema = painel.linhas.filter((l) => l.divergencias.some((d) => d.gravidade === "erro"));
  const ativas = painel.linhas.filter((l) => l.mp?.status === "authorized").length;
  const aguardandoCartao = painel.linhas.filter((l) => l.mp?.status === "pending").length;

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="mercadopago">
      <header className="page-header">
        <div>
          <h1>Mercado Pago</h1>
          <p>A conta que cobra a mensalidade das lojas, comparada com o que a plataforma registra.</p>
        </div>
        <div className="page-header-actions">
          <Link className="text-button" href="/financeiro/mercadopago/cobrar">
            Cobrança avulsa
          </Link>
          <VarreduraCobrancaButton />
        </div>
      </header>

      {!painel.configurado && (
        <section className="mp-alerta">
          <h2>Mercado Pago não configurado</h2>
          <p>
            Falta <code>MP_ACCESS_TOKEN</code> no ambiente deste app. Sem ele nada nesta tela carrega -
            a cobrança da mensalidade em si continua rodando pelo lojas.avilaops.com.
          </p>
        </section>
      )}

      {painel.falhas.length > 0 && (
        <section className="mp-alerta" aria-label="Falhas de leitura">
          <h2>Nem tudo carregou</h2>
          <ul>
            {painel.falhas.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p>O resto da tela mostra o que deu para ler - não é a foto completa.</p>
        </section>
      )}

      {painel.configurado && (
        <>
          <section className="metric-grid" aria-label="Resumo da cobrança">
            <article className="metric">
              <span>Receita recorrente</span>
              <strong>{formatCurrency(painel.receitaMensalCentavos / 100)}</strong>
              <small>{ativas} assinatura(s) ativa(s)</small>
            </article>
            <article className="metric">
              <span>Aguardando cartão</span>
              <strong>{aguardandoCartao}</strong>
              <small>criadas mas nunca autorizadas</small>
            </article>
            <article className="metric">
              <span>Divergências</span>
              <strong>{comProblema.length}</strong>
              <small>plataforma e Mercado Pago discordando</small>
            </article>
            <article className="metric">
              <span>Conta em uso</span>
              <strong>{painel.conta?.apelido ?? "-"}</strong>
              <small>{painel.conta ? `${painel.conta.email} · ${painel.conta.pais}` : "não identificada"}</small>
            </article>
          </section>

          <section className="mp-painel" aria-label="Saúde da integração">
            <h2>Notificações</h2>
            {painel.saudeWebhook ? (
              <div className={classePorGravidade[painel.saudeWebhook.gravidade]}>
                <strong>{painel.saudeWebhook.titulo}</strong>
                <p>{painel.saudeWebhook.detalhe}</p>
              </div>
            ) : (
              <div className={classePorGravidade.ok}>
                <strong>Webhook no lugar certo</strong>
                <p>
                  {painel.webhook?.aplicacao} está avisando <code>{WEBHOOK_ESPERADO}</code> e escuta{" "}
                  {painel.webhook?.topicos.length} tópico(s). As faturas aparecem na hora.
                </p>
              </div>
            )}
            <p className="mp-nota">
              A configuração de webhook não tem API: só o painel do Mercado Pago altera. Esta tela
              serve para você descobrir que ela quebrou antes do cliente descobrir.
            </p>
          </section>

          <section className="mp-painel" aria-label="Assinaturas">
            <h2>Mensalidades</h2>
            {painel.linhas.length === 0 ? (
              <p className="table-empty">Nenhuma assinatura e nenhuma loja ainda.</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Loja</th>
                      <th>Plano</th>
                      <th>Mercado Pago</th>
                      <th>Plataforma</th>
                      <th>Valor</th>
                      <th>Próxima</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {painel.linhas.map((l, i) => {
                      // Chave estável: id da assinatura, senão o slug da loja, senão a posição.
                      const chave = l.mp?.id ?? l.loja?.slug ?? `linha-${i}`;
                      const pior = l.divergencias.find((d) => d.gravidade === "erro") ?? l.divergencias[0];
                      return (
                        <tr key={chave} className={pior?.gravidade === "erro" ? "mp-linha-erro" : undefined}>
                          <td>
                            <strong>
                              {l.mp ? (
                                <Link href={`/financeiro/mercadopago/${l.mp.id}`}>{l.loja?.nome ?? l.mp.loja ?? "-"}</Link>
                              ) : (
                                (l.loja?.nome ?? "-")
                              )}
                            </strong>
                            <small>{l.loja?.slug ?? l.mp?.pagador ?? ""}</small>
                            {pior && (
                              <p className={classePorGravidade[pior.gravidade]}>
                                <strong>{pior.titulo}</strong> {pior.detalhe}
                              </p>
                            )}
                          </td>
                          <td>{l.loja?.plano ?? "-"}</td>
                          <td>{l.mp ? (STATUS_ASSINATURA[l.mp.status] ?? l.mp.status) : "sem assinatura"}</td>
                          <td>
                            {l.loja ? (STATUS_LOJA[l.loja.status] ?? l.loja.status) : "sem loja"}
                            {l.loja?.assinaturaStatus && <small>{l.loja.assinaturaStatus}</small>}
                          </td>
                          <td>{l.mp ? formatCurrency(l.mp.valorCentavos / 100) : "-"}</td>
                          <td>{l.mp?.proximaCobranca ? formatShortDate(l.mp.proximaCobranca) : "-"}</td>
                          <td>
                            {l.loja?.assinaturaId ? (
                              <AcoesAssinatura
                                slug={l.loja.slug}
                                nome={l.loja.nome}
                                status={l.mp?.status ?? "pending"}
                                valorCentavos={l.mp?.valorCentavos ?? 0}
                              />
                            ) : l.mp?.linkCadastroCartao ? (
                              <a className="text-button" href={l.mp.linkCadastroCartao} target="_blank" rel="noopener">
                                Link do cartão
                              </a>
                            ) : (
                              <span className="mp-nota">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="mp-painel" aria-label="Pagamentos recebidos">
            <h2>Últimos recebimentos</h2>
            {painel.pagamentos.length === 0 ? (
              <p className="table-empty">Nenhum pagamento nesta conta ainda.</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Descrição</th>
                      <th>Pagador</th>
                      <th>Meio</th>
                      <th>Situação</th>
                      <th>Bruto</th>
                      <th>Líquido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {painel.pagamentos.map((p) => (
                      <tr key={p.id}>
                        <td>{formatShortDate(p.data)}</td>
                        <td>
                          <a href={linkDoPagamento(p.id)} target="_blank" rel="noopener">
                            {p.descricao ?? `#${p.id}`}
                          </a>
                        </td>
                        <td>{p.email ?? "-"}</td>
                        <td>{p.meio ?? "-"}</td>
                        <td>
                          {STATUS_PAGAMENTO[p.status] ?? p.status}
                          {p.detalhe && p.status !== "approved" && <small>{p.detalhe}</small>}
                        </td>
                        <td>{formatCurrency(p.valorCentavos / 100)}</td>
                        <td>{p.liquidoCentavos !== null ? formatCurrency(p.liquidoCentavos / 100) : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}
