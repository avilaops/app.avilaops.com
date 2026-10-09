import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import AcoesAssinatura from "@/components/AcoesAssinatura";
import { ACOES_DO_MODULO } from "@/components/financeiro/acoes";
import Aviso from "@/components/financeiro/Aviso";
import CabecalhoFinanceiro from "@/components/financeiro/CabecalhoFinanceiro";
import CriarMensalidade from "@/components/CriarMensalidade";
import { FaixaIndicadores, Indicador } from "@/components/financeiro/Indicadores";
import Painel from "@/components/financeiro/Painel";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import { Button } from "@/components/shadcn/button";
import { ehDono, getAdmin } from "@/lib/auth";
import { contar, formatCurrency, formatDate } from "@/lib/format";
import { linkDoPagamento } from "@/lib/mercadopago";
import { montarPainel, WEBHOOK_ESPERADO, type LinhaAssinatura } from "@/lib/mercadopago-painel";
import { contextoDaSecao } from "@/lib/navegacao";
import { cn } from "@/lib/utils";

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

const MEIO: Record<string, string> = {
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
  bank_transfer: "Pix ou transferência",
  account_money: "Saldo Mercado Pago",
  ticket: "Boleto",
};

const PLANO: Record<string, string> = { SITE: "Site", LOJA: "Loja", LOJA_PRO: "Loja Pro" };

/**
 * Nome humano da linha. A referência externa do Mercado Pago é o slug da loja
 * quando a assinatura nasceu na plataforma, mas também pode ser
 * `arxisvr:u-smoke-…:starter:monthly` ou `auto:YvBFX…`, que apareciam como
 * título. Sem loja, o título é o motivo que a própria assinatura declara; a
 * referência técnica vai para uma linha discreta, cortada, com o valor
 * inteiro no `title` para conferir.
 */
function titulo(l: LinhaAssinatura) {
  return l.loja?.nome ?? (l.mp?.motivo || "Assinatura sem loja");
}

function referencia(l: LinhaAssinatura) {
  if (l.loja) return l.loja.slug;
  return l.mp?.loja ?? null;
}

export default async function MercadoPagoPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  // Dinheiro, segredo e acesso são do dono: a equipe opera o resto.
  if (!ehDono(admin.role)) redirect("/operacao");

  const painel = await montarPainel();
  const comProblema = painel.linhas.filter((l) => l.divergencias.some((d) => d.gravidade === "erro"));
  const ativas = painel.linhas.filter((l) => l.mp?.status === "authorized").length;
  const aguardandoCartao = painel.linhas.filter((l) => l.mp?.status === "pending").length;
  const recusados = painel.pagamentos.filter((p) => p.status === "rejected").length;

  const encerrada = (l: LinhaAssinatura) => Boolean(l.mp && !l.loja && l.mp.status === "cancelled");
  const visiveis = painel.linhas.filter((l) => !encerrada(l));
  const encerradas = painel.linhas.filter(encerrada);

  const renderLinha = (l: LinhaAssinatura, i: number) => {
                  const chave = l.mp?.id ?? l.loja?.slug ?? `linha-${i}`;
                  const pior = l.divergencias.find((d) => d.gravidade === "erro") ?? l.divergencias[0];
                  const ref = referencia(l);
                  return (
                    <li
                      key={chave}
                      className="grid min-w-0 gap-x-4 gap-y-2 border-b border-border py-3 last:border-b-0 min-[900px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto]"
                    >
                      <div className="min-w-0">
                        <strong className="block break-words text-[15px] font-semibold text-foreground">
                          {l.mp ? (
                            <Link href={`/financeiro/mercadopago/${l.mp.id}`} className="hover:underline">
                              {titulo(l)}
                            </Link>
                          ) : (
                            titulo(l)
                          )}
                        </strong>
                        {ref ? (
                          <details className="text-[12px] text-muted-foreground">
                            <summary className="inline-flex min-h-11 cursor-pointer items-center underline">Ver referência</summary>
                            <span className="block font-mono [overflow-wrap:anywhere]">{ref}</span>
                          </details>
                        ) : null}
                        {pior ? (
                          <div className="mt-2">
                            <Aviso compacto gravidade={pior.gravidade} titulo={pior.titulo}>
                              <span>{pior.detalhe}</span>
                            </Aviso>
                          </div>
                        ) : null}
                      </div>
                      <dl className="m-0 grid min-w-0 grid-cols-2 content-start gap-x-3 gap-y-1 text-[13px]">
                        <div className="min-w-0">
                          <dt className="text-muted-foreground">Mercado Pago</dt>
                          <dd className="m-0 text-foreground">{l.mp ? (STATUS_ASSINATURA[l.mp.status] ?? "Outro estado") : "Sem assinatura"}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-muted-foreground">Plataforma</dt>
                          <dd className="m-0 text-foreground">
                            {l.loja ? (STATUS_LOJA[l.loja.status] ?? "Outro estado") : "Sem loja"}
                            {l.loja ? ` · ${PLANO[l.loja.plano] ?? l.loja.plano}` : ""}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-muted-foreground">Valor</dt>
                          <dd className="m-0 text-foreground tabular-nums">{l.mp ? formatCurrency(l.mp.valorCentavos / 100) : "Sem valor"}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-muted-foreground">Próxima</dt>
                          <dd className="m-0 text-foreground">{l.mp?.proximaCobranca ? formatDate(l.mp.proximaCobranca) : "Sem data"}</dd>
                        </div>
                      </dl>
                      <div className="flex min-w-0 items-start justify-end max-[899px]:justify-start">
                        {l.loja?.assinaturaId ? (
                          <AcoesAssinatura
                            slug={l.loja.slug}
                            nome={l.loja.nome}
                            status={l.mp?.status ?? "pending"}
                            valorCentavos={l.mp?.valorCentavos ?? 0}
                          />
                        ) : l.loja?.cobrancaIsenta ? (
                          <span className="max-w-[220px] text-right text-[12px] text-muted-foreground max-[899px]:text-left">
                            Isenta: cobrada fora da plataforma.
                          </span>
                        ) : l.loja && !l.mp && l.loja.status !== "CANCELADA" ? (
                          <CriarMensalidade slug={l.loja.slug} nome={l.loja.nome} plano={PLANO[l.loja.plano] ?? l.loja.plano} />
                        ) : l.mp?.linkCadastroCartao ? (
                          <Button asChild variant="outline" size="sm" className="min-h-9">
                            <a href={l.mp.linkCadastroCartao} target="_blank" rel="noopener">
                              Link do cartão
                            </a>
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  );
  };

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="mercadopago">
      <CabecalhoFinanceiro
        titulo="Mercado Pago"
        descricao="A conta que cobra a mensalidade das lojas, comparada com o que a plataforma registra."
        voltar={contextoDaSecao("mercadopago").voltar}
        acoes={[
          { tipo: "link", rotulo: "Cobrança avulsa", href: "/financeiro/mercadopago/cobrar", icone: "cobranca" },
          ...ACOES_DO_MODULO.filter((a) => a.tipo !== "sincronizar"),
          { tipo: "varredura-cobranca" },
        ]}
      />

      {!painel.configurado ? (
        <EstadoVazio
          titulo="Mercado Pago não configurado"
          descricao="Conecte a conta do Mercado Pago para consultar as cobranças. Não foi possível verificar a situação dos recebimentos."
        />
      ) : null}

      {painel.falhas.length > 0 && painel.configurado ? (
        <div className="mb-4">
          <Aviso gravidade="erro" titulo="Nem tudo carregou">
            <ul className="m-0 mt-1 pl-4">
              {painel.falhas.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <p className="m-0 mt-1">O resto da tela mostra o que deu para ler, não a foto completa.</p>
          </Aviso>
        </div>
      ) : null}

      {painel.configurado ? (
        <>
          <FaixaIndicadores rotulo="Resumo da cobrança">
            <Indicador
              rotulo="Receita recorrente"
              valor={formatCurrency(painel.receitaMensalCentavos / 100)}
              detalhe={contar(ativas, "assinatura ativa", "assinaturas ativas")}
            />
            <Indicador
              rotulo="Aguardando cartão"
              valor={aguardandoCartao.toLocaleString("pt-BR")}
              detalhe="Criadas e nunca autorizadas"
              tom={aguardandoCartao > 0 ? "atencao" : "neutro"}
            />
            <Indicador
              rotulo="Divergências"
              valor={comProblema.length.toLocaleString("pt-BR")}
              detalhe="Plataforma e Mercado Pago discordando"
              tom={comProblema.length > 0 ? "saida" : "neutro"}
            />
            <Indicador
              rotulo="Pagamentos recusados"
              valor={recusados.toLocaleString("pt-BR")}
              detalhe={`Entre os ${painel.pagamentos.length.toLocaleString("pt-BR")} mais recentes`}
              tom={recusados > 0 ? "atencao" : "neutro"}
            />
          </FaixaIndicadores>

          <details className="mb-4"><summary className="cursor-pointer py-3 text-sm font-semibold">Detalhes da conta e das notificações</summary><Painel titulo="Conta e notificações">
            <div className="grid gap-3 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
              {/* O apelido da conta é um identificador de 40 caracteres sem
                  espaço: numa célula de indicador ele estourava a largura. Aqui
                  ele quebra onde precisar. */}
              <dl className="m-0 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]">
                <dt className="text-muted-foreground">Conta</dt>
                <dd className="m-0 min-w-0 font-mono text-[12px] [overflow-wrap:anywhere] text-foreground">
                  {painel.conta?.apelido ?? "Não identificada"}
                </dd>
                <dt className="text-muted-foreground">E-mail</dt>
                <dd className="m-0 min-w-0 [overflow-wrap:anywhere] text-foreground">{painel.conta?.email ?? "Não informado"}</dd>
                <dt className="text-muted-foreground">País</dt>
                <dd className="m-0 text-foreground">{painel.conta?.pais === "MLB" ? "Brasil" : (painel.conta?.pais ?? "Não informado")}</dd>
              </dl>
              <div className="min-w-0">
                {painel.saudeWebhook ? (
                  <Aviso gravidade={painel.saudeWebhook.gravidade} titulo={painel.saudeWebhook.titulo}>
                    {painel.saudeWebhook.detalhe}
                  </Aviso>
                ) : (
                  <Aviso gravidade="ok" titulo="Webhook no lugar certo">
                    {painel.webhook?.aplicacao} avisa <code className="[overflow-wrap:anywhere]">{WEBHOOK_ESPERADO}</code> e escuta{" "}
                    {contar(painel.webhook?.topicos.length ?? 0, "tópico", "tópicos")}. As faturas aparecem na hora.
                  </Aviso>
                )}
                <p className="m-0 mt-2 text-[12px] text-muted-foreground">
                  A configuração de webhook não tem API: só o painel do Mercado Pago altera. Esta tela
                  serve para descobrir que ela quebrou antes do cliente.
                </p>
              </div>
            </div>
          </Painel>

          </details>
          <Painel titulo="Mensalidades" descricao="Com problema primeiro.">
            {painel.linhas.length === 0 ? (
              <EstadoVazio compacto titulo="Nenhuma assinatura e nenhuma loja ainda." />
            ) : (
              <>
                {visiveis.length === 0 ? (
                  <EstadoVazio compacto titulo="Nenhuma mensalidade em uso." />
                ) : (
                  <ul className="m-0 list-none p-0">{visiveis.map(renderLinha)}</ul>
                )}
                {encerradas.length > 0 ? (
                  /*
                    Assinatura cancelada no Mercado Pago e sem loja: teste antigo
                    ou loja que saiu. O Mercado Pago não apaga assinatura, então
                    "excluir" aqui é tirar da frente — elas continuam a um toque.
                  */
                  <details className="mt-2 border-t border-border pt-2">
                    <summary className="inline-flex min-h-11 cursor-pointer items-center text-[13px] text-muted-foreground underline">
                      {contar(encerradas.length, "cancelada sem loja", "canceladas sem loja")}
                    </summary>
                    <ul className="m-0 list-none p-0">{encerradas.map(renderLinha)}</ul>
                  </details>
                ) : null}
              </>
            )}
          </Painel>

          <Painel titulo="Últimos recebimentos">
            {painel.pagamentos.length === 0 ? (
              <EstadoVazio compacto titulo="Nenhum pagamento nesta conta ainda." />
            ) : (
              <ul className="m-0 list-none p-0">
                {painel.pagamentos.map((p) => {
                  const recusado = p.status === "rejected" || p.status === "cancelled";
                  return (
                    <li
                      key={p.id}
                      className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 border-b border-border py-3 last:border-b-0"
                    >
                      <a
                        href={linkDoPagamento(p.id)}
                        target="_blank"
                        rel="noopener"
                        className="line-clamp-2 min-w-0 text-[14px] font-medium text-foreground hover:underline"
                        title={p.descricao ?? undefined}
                      >
                        {p.descricao ?? `Pagamento ${p.id}`}
                      </a>
                      <span
                        className={cn(
                          "text-right text-[14px] whitespace-nowrap tabular-nums",
                          recusado ? "text-muted-foreground line-through" : "text-[color:var(--green)]",
                        )}
                      >
                        {formatCurrency(p.valorCentavos / 100)}
                      </span>
                      <span className="min-w-0 truncate text-[12px] text-muted-foreground">
                        {formatDate(p.data)} · {p.meio ? (MEIO[p.meio] ?? "Outro meio") : "Meio não informado"}
                        {p.email ? ` · ${p.email}` : ""}
                      </span>
                      <span
                        className={cn(
                          "text-right text-[12px] whitespace-nowrap",
                          recusado ? "text-[color:var(--red)]" : "text-muted-foreground",
                        )}
                        title={p.detalhe ?? undefined}
                      >
                        {STATUS_PAGAMENTO[p.status] ?? "Outro estado"}
                        {p.liquidoCentavos !== null && !recusado ? ` · líquido ${formatCurrency(p.liquidoCentavos / 100)}` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Painel>
        </>
      ) : null}
    </AppShell>
  );
}
