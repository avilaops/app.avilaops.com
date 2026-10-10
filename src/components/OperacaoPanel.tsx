"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Cartao, chamar, dataCurta, dinheiro, Pill, type Resultado } from "@/components/provisionamento/comum";
import Confirmacao from "@/components/sistema/Confirmacao";
import { Icone } from "@/components/ui/Icones";
import Sheet from "@/components/ui/Sheet";
import { pedidoDeEnvio, type ModoEnvio } from "@/lib/envio-cobranca-pedido";

export type CobrancaDaFicha = {
  id: string;
  method: string;
  status: string;
  pixCopyPaste: string | null;
  boletoUrl: string | null;
  boletoBarcode: string | null;
  expiresAt: string | null;
};

export type FaturaDaFicha = {
  id: string;
  competence: string;
  kind: string;
  amountCents: number;
  dueDate: string;
  status: string;
  paidAt: string | null;
  cobranca: CobrancaDaFicha | null;
};

export type AssinaturaDaFicha = {
  id: string;
  description: string;
  amountCents: number;
  /** Moeda da assinatura: fatura em USD não pode aparecer com R$. */
  currency: string;
  billingDay: number;
  /** MONTHLY | YEARLY. */
  billingCycle: string;
  status: string;
  startedAt: string;
  productKey: string | null;
  productTenantId: string | null;
  /** Percentual sobre as vendas combinado além do valor fixo; nulo para quem não tem. */
  salesCommissionPercent: number | null;
  invoices: FaturaDaFicha[];
};

export type PlanoDaFicha = {
  id: string;
  name: string;
  serviceType: string;
  priceCents: number | null;
  /** Sem isto a ficha mostrava plano em dólar com cifrão de real. */
  currency: string;
  billingCycle: string | null;
};

export type MarcaDaFicha = { id: string; name: string; slug: string; siteUrl: string | null; status: string };

export type CredencialDaFicha = {
  id: string;
  provider: string;
  accountName: string | null;
  externalId: string | null;
  status: string;
  tokenExpiresAt: string | null;
  temSegredo: boolean;
  nota: string | null;
  updatedAt: string;
};

export type EtapaDaFicha = {
  stepKey: string;
  label: string;
  status: string;
  completedAt: string | null;
  notes: string | null;
};

type Props = {
  organizationId: string;
  nomeCliente: string;
  assinaturas: AssinaturaDaFicha[];
  planos: PlanoDaFicha[];
  marcas: MarcaDaFicha[];
  credenciais: CredencialDaFicha[];
  etapas: EtapaDaFicha[];
  cofreDisponivel: boolean;
  /** Fora do Brasil a cobrança é por PayPal, na moeda da assinatura. */
  clienteNoBrasil: boolean;
};

const rotuloCiclo: Record<string, string> = {
  MONTHLY: "mensal",
  YEARLY: "anual",
  ONE_TIME: "único",
  TWO_YEARS: "2 anos",
  FOUR_YEARS: "4 anos",
};

const provedoresSugeridos = ["openai", "cloudflare", "google", "meta", "mercadopago", "resend", "twilio", "hostinger", "registrobr"];

function precoTexto(cents: number | null) {
  return cents === null ? "" : (cents / 100).toFixed(2).replace(".", ",");
}

/**
 * O que é dado do app, não integração: cobrança recorrente, etapas do
 * onboarding, marcas e cofre de credenciais. Mesma linguagem do painel de
 * provisionamento — cartão, folha, resultado na tela.
 */
export default function OperacaoPanel({
  organizationId,
  nomeCliente,
  assinaturas,
  planos,
  marcas,
  credenciais,
  etapas,
  cofreDisponivel,
  clienteNoBrasil,
}: Props) {
  const router = useRouter();
  const base = `/api/organizations/${organizationId}`;
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [folha, setFolha] = useState<"assinatura" | "marca" | "credencial" | null>(null);
  const [resultados, setResultados] = useState<Record<string, Resultado | null>>({});
  const fecharFolha = useCallback(() => setFolha(null), []);

  useEffect(() => {
    if (!aviso) return;
    const timer = window.setTimeout(() => setAviso(""), 3200);
    return () => window.clearTimeout(timer);
  }, [aviso]);

  function registrar(chave: string, resultado: Resultado | null) {
    setResultados((atual) => ({ ...atual, [chave]: resultado }));
  }

  async function executar(chave: string, acao: () => Promise<Resultado | null>, mensagem?: string) {
    setOcupado(chave);
    try {
      const resultado = await acao();
      registrar(chave, resultado);
      if (mensagem) setAviso(mensagem);
      setFolha(null);
      router.refresh();
    } catch (erro) {
      registrar(chave, { tipo: "erro", conteudo: erro instanceof Error ? erro.message : "Falhou." });
    } finally {
      setOcupado(null);
    }
  }

  /* ---------- Cobrança ---------- */
  const planosRecorrentes = planos.filter((p) => p.billingCycle === "MONTHLY" || p.billingCycle === "YEARLY");
  const planosUnicos = planos.filter((p) => p.billingCycle === "ONE_TIME");
  const [formAssinatura, setFormAssinatura] = useState({
    planoId: "",
    descricao: "",
    valor: "",
    /** MONTHLY | YEARLY. Serviço pago por ano não cabe no valor mensal. */
    ciclo: "MONTHLY",
    dia: "10",
    inicio: new Date().toISOString().slice(0, 10),
    implantacaoPlanoId: "",
    implantacao: "",
    produto: "",
    tenant: "",
  });

  const anual = formAssinatura.ciclo === "YEARLY";

  function escolherPlano(planoId: string) {
    const plano = planosRecorrentes.find((p) => p.id === planoId);
    setFormAssinatura((f) => ({
      ...f,
      planoId,
      descricao: plano ? plano.name : f.descricao,
      valor: plano && plano.priceCents !== null ? precoTexto(plano.priceCents) : f.valor,
      // O ciclo do catálogo manda: plano anual escolhido não pode virar
      // mensalidade por esquecimento de trocar o seletor.
      ciclo: plano?.billingCycle === "YEARLY" ? "YEARLY" : plano ? "MONTHLY" : f.ciclo,
    }));
  }

  function escolherImplantacao(planoId: string) {
    const plano = planosUnicos.find((p) => p.id === planoId);
    setFormAssinatura((f) => ({
      ...f,
      implantacaoPlanoId: planoId,
      implantacao: plano && plano.priceCents !== null ? precoTexto(plano.priceCents) : f.implantacao,
    }));
  }

  async function enviarAssinatura(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    await executar(
      "cobranca",
      async () => {
        const r = await chamar<{ faturas: { tipo: string; competencia: string; vencimento: string; valorCents: number }[] }>(
          `${base}/assinatura`,
          formAssinatura,
        );
        return {
          tipo: "ok",
          conteudo: (
            <>
              <strong>Assinatura criada.</strong>
              <span>
                Faturas abertas:{" "}
                {r.faturas.map((f) => `${f.tipo === "SETUP" ? "implantação" : (f.tipo === "YEARLY" ? "anuidade " : "mensalidade ") + f.competencia} ${dinheiro(f.valorCents)} (vence ${dataCurta(f.vencimento)})`).join("; ")}.
                Gere o PIX ou o boleto na lista.
              </span>
            </>
          ),
        };
      },
      "Assinatura criada.",
    );
  }

  const [assinaturaParaCancelar, setAssinaturaParaCancelar] = useState<string | null>(null);
  const [credencialParaRemover, setCredencialParaRemover] = useState<string | null>(null);

  async function agir(assinaturaId: string, acao: "pausar" | "retomar" | "cancelar" | "gerar-fatura") {
    setAssinaturaParaCancelar(null);
    await executar(
      "cobranca",
      async () => {
        await chamar(`${base}/assinatura/${assinaturaId}`, { acao }, "PATCH");
        return null;
      },
      acao === "gerar-fatura" ? "Próxima fatura garantida." : `Assinatura: ${acao === "pausar" ? "pausada" : acao === "retomar" ? "retomada" : "cancelada"}.`,
    );
  }

  // Pix que o cliente mandou direto na chave: nenhum webhook fecha essa fatura.
  // Pede o que está no comprovante — a data e o ID da transação, que é o que
  // impede lançar o mesmo pagamento duas vezes.
  async function registrarPagamento(invoiceId: string) {
    const pagoEm = window.prompt("Data do pagamento, como está no comprovante (AAAA-MM-DD):", new Date().toISOString().slice(0, 10));
    if (pagoEm === null) return; // cancelou
    const comprovante = window.prompt("ID da transação do comprovante Pix (começa com E):");
    if (comprovante === null) return; // cancelou
    await executar(
      "cobranca",
      async () => {
        await chamar(`/api/billing/faturas/${invoiceId}/baixa`, { pagoEm: pagoEm.trim(), comprovante: comprovante.trim() });
        return null;
      },
      "Pagamento registrado.",
    );
  }

  // O valor novo vale da próxima fatura em diante: as que já existem ficam como
  // nasceram, e é o texto da pergunta que diz isso a quem está mudando.
  async function ajustarValor(assinaturaId: string, atualCents: number, ciclo: string) {
    const resposta = window.prompt(
      `Novo valor ${ciclo === "YEARLY" ? "anual" : "mensal"}, em reais.\n\nVale a partir da próxima fatura; as já emitidas não mudam.`,
      (atualCents / 100).toFixed(2).replace(".", ","),
    );
    if (resposta === null || !resposta.trim()) return; // cancelou
    await executar(
      "cobranca",
      async () => {
        await chamar(`${base}/assinatura/${assinaturaId}`, { acao: "ajustar", valor: resposta.trim() }, "PATCH");
        return null;
      },
      "Valor atualizado.",
    );
  }

  async function criarImplantacao(assinaturaId: string) {
    const valor = window.prompt("Valor da implantação, em reais:");
    if (valor === null || !valor.trim()) return; // cancelou
    const vencimento = window.prompt("Vencimento da implantação (AAAA-MM-DD):", new Date().toISOString().slice(0, 10));
    if (vencimento === null || !vencimento.trim()) return; // cancelou
    await executar(
      "cobranca",
      async () => {
        await chamar(`${base}/assinatura/${assinaturaId}`, { acao: "implantacao", valor: valor.trim(), vencimento: vencimento.trim() }, "PATCH");
        return null;
      },
      "Implantação criada.",
    );
  }

  async function cancelarFatura(assinaturaId: string, invoiceId: string, rotulo: string) {
    if (!window.confirm(`Cancelar a fatura "${rotulo}"?\n\nEla deixa de ser cobrada e sai do que o cliente deve. Não dá para reabrir.`)) return;
    await executar(
      "cobranca",
      async () => {
        await chamar(`${base}/assinatura/${assinaturaId}`, { acao: "cancelar-fatura", invoiceId }, "PATCH");
        return null;
      },
      "Fatura cancelada.",
    );
  }

  async function ajustarComissao(assinaturaId: string, atual: number | null) {
    const resposta = window.prompt("Comissão sobre as vendas, em % (0 tira a comissão):", atual === null ? "" : String(atual).replace(".", ","));
    if (resposta === null || !resposta.trim()) return; // cancelou
    await executar(
      "cobranca",
      async () => {
        await chamar(`${base}/assinatura/${assinaturaId}`, { acao: "ajustar", comissao: resposta.trim() }, "PATCH");
        return null;
      },
      "Comissão atualizada.",
    );
  }

  // Pela fatura, não pela cobrança: sem cobrança emitida ainda dá para mandar o
  // resumo; com cobrança, o servidor usa a mais recente e recusa a que não vale.
  //
  // Teste e cliente real são botões separados: destino de teste em branco não
  // envia nada, e o envio real só sai pelo botão dele, depois da confirmação.
  async function enviarCobranca(invoiceId: string, temCobranca: boolean, canal: "email" | "whatsapp", modo: ModoEnvio) {
    let conteudo: "cobranca" | "fatura" | "ambos" = "fatura";
    if (temCobranca) {
      const escolha = window.prompt("O que enviar?\n\n1 = boleto/link de pagamento\n2 = fatura (resumo)\n3 = fatura + boleto", "1");
      if (escolha === null) return; // cancelou
      conteudo = escolha.trim() === "2" ? "fatura" : escolha.trim() === "3" ? "ambos" : "cobranca";
    }

    let destinoTeste: string | null = null;
    if (modo === "teste") {
      const rotulo = canal === "email" ? "e-mail" : "número de WhatsApp (com DDI/DDD)";
      destinoTeste = window.prompt(`Envio de TESTE por ${canal} — para qual ${rotulo}?\n\n(Não vai para o cliente.)`);
      if (destinoTeste === null) return; // cancelou
    } else if (!window.confirm(`Enviar esta cobrança por ${canal} ao CLIENTE REAL agora?`)) {
      return;
    }

    const pedido = pedidoDeEnvio(modo, canal, conteudo, destinoTeste);
    if (!pedido) {
      registrar("cobranca", { tipo: "erro", conteudo: "Informe o destino do teste. Nada foi enviado." });
      return;
    }
    await executar(
      "cobranca",
      async () => {
        const r = await chamar<{ destino: string; registrado?: boolean; aviso?: string }>(
          `/api/billing/faturas/${invoiceId}/enviar`,
          pedido,
          "POST",
        );
        const enviado = <strong>Enviado por {canal} para {r.destino}{pedido.teste ? " (teste)" : ""}.</strong>;
        // A mensagem saiu, mas o servidor não gravou o resultado na auditoria:
        // o operador precisa saber, não ver um "enviado" limpo.
        if (r.registrado === false) {
          return { tipo: "erro", conteudo: <>{enviado} {r.aviso ?? "O registro na auditoria falhou."}</> };
        }
        return { tipo: "ok", conteudo: enviado };
      },
      `Cobrança enviada por ${canal}.`,
    );
  }

  // Dois botões por fatura, e não quatro: no celular os quatro caíam um por
  // linha e cada fatura aberta ocupava uma tela. O que separa os botões é o que
  // não pode se confundir — teste e cliente real; o canal é só uma pergunta.
  // Resposta que não é 1 nem 2 não envia: adivinhar o canal mandaria a cobrança
  // por onde a pessoa não pediu.
  async function enviarPor(invoiceId: string, temCobranca: boolean, modo: ModoEnvio) {
    const escolha = window.prompt(
      `${modo === "teste" ? "Envio de TESTE" : "Envio ao CLIENTE"} — por onde?\n\n1 = e-mail\n2 = WhatsApp`,
      "1",
    );
    if (escolha === null) return; // cancelou
    const canal = escolha.trim() === "1" ? "email" : escolha.trim() === "2" ? "whatsapp" : null;
    if (!canal) {
      registrar("cobranca", { tipo: "erro", conteudo: "Escolha 1 (e-mail) ou 2 (WhatsApp). Nada foi enviado." });
      return;
    }
    await enviarCobranca(invoiceId, temCobranca, canal, modo);
  }

  async function cobrar(assinaturaId: string, invoiceId: string, metodo: "PIX" | "BOLETO" | "PAYPAL", moeda: string) {
    await executar(
      "cobranca",
      async () => {
        const r = await chamar<{ cobranca: { pixCopiaECola: string | null; boletoUrl: string | null; boletoLinhaDigitavel: string | null; checkoutUrl: string | null; expiraEm: string | null; valorCents: number } }>(
          `${base}/assinatura/${assinaturaId}`,
          { acao: "cobrar", invoiceId, metodo },
          "PATCH",
        );
        const c = r.cobranca;
        return {
          tipo: "ok",
          conteudo: (
            <>
              <strong>{metodo === "PIX" ? "PIX" : metodo === "PAYPAL" ? "PayPal" : "Boleto"} de {dinheiro(c.valorCents, moeda)} emitido{c.expiraEm ? ` (vale até ${dataCurta(c.expiraEm)})` : ""}.</strong>
              {c.pixCopiaECola ? (
                <span>
                  Copia e cola: <code className="prov-copia">{c.pixCopiaECola}</code>
                </span>
              ) : null}
              {c.boletoUrl ? (
                <span>
                  Boleto: <a href={c.boletoUrl} target="_blank" rel="noreferrer">{c.boletoUrl}</a>
                </span>
              ) : null}
              {c.checkoutUrl ? (
                <span>
                  Link de pagamento: <a href={c.checkoutUrl} target="_blank" rel="noreferrer">{c.checkoutUrl}</a>
                </span>
              ) : null}
              {c.boletoLinhaDigitavel ? (
                <span>
                  Linha digitável: <code className="prov-copia">{c.boletoLinhaDigitavel}</code>
                </span>
              ) : null}
            </>
          ),
        };
      },
      "Cobrança emitida.",
    );
  }

  /* ---------- Marcas ---------- */
  const [formMarca, setFormMarca] = useState({ name: "", siteUrl: "" });
  async function enviarMarca(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    await executar(
      "marcas",
      async () => {
        const r = await chamar<{ marca: { name: string; slug: string } }>(`${base}/marcas`, formMarca);
        setFormMarca({ name: "", siteUrl: "" });
        return { tipo: "ok", conteudo: <strong>Marca {r.marca.name} criada (slug {r.marca.slug}).</strong> };
      },
      "Marca criada.",
    );
  }

  /* ---------- Cofre ---------- */
  const [formCredencial, setFormCredencial] = useState({ provider: "", accountName: "", externalId: "", segredo: "", validade: "", nota: "" });
  async function enviarCredencial(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    await executar(
      "cofre",
      async () => {
        const r = await chamar<{ credencial: { provider: string } }>(`${base}/cofre`, formCredencial);
        setFormCredencial({ provider: "", accountName: "", externalId: "", segredo: "", validade: "", nota: "" });
        return { tipo: "ok", conteudo: <strong>Credencial {r.credencial.provider} guardada. O segredo não aparece mais.</strong> };
      },
      "Credencial guardada.",
    );
  }

  async function removerCredencial(provider: string) {
    setCredencialParaRemover(null);
    await executar(
      "cofre",
      async () => {
        await chamar(`${base}/cofre/${encodeURIComponent(provider)}`, {}, "DELETE");
        return { tipo: "ok", conteudo: <strong>Credencial {provider} removida.</strong> };
      },
      "Credencial removida.",
    );
  }

  const rodape = (form: string, texto: string, chave: string) => (
    <>
      <button type="submit" form={form} className="primary-button" disabled={ocupado === chave}>
        {ocupado === chave ? "Enviando…" : texto}
      </button>
      <button type="button" className="secondary-button" onClick={fecharFolha} disabled={ocupado === chave}>
        Cancelar
      </button>
    </>
  );

  return (
    <section className="prov-section" aria-labelledby="oper-titulo">
      <div className="plan-section-head">
        <h3 id="oper-titulo">Cobrança e cadastro</h3>
      </div>

      <div className="prov-grid">
        <Cartao
          titulo="Cobrança recorrente"
          resultado={resultados.cobranca ?? null}
          acoes={
            <button type="button" className="primary-button" onClick={() => setFolha("assinatura")}>
              <Icone nome="adicionar" tamanho={18} />
              Nova assinatura
            </button>
          }
        >
          {assinaturas.length === 0 ? (
            <div className="ios-list">
              <p className="prov-empty">Nenhuma assinatura. Crie a partir de um plano do catálogo.</p>
            </div>
          ) : (
            assinaturas.map((a) => (
              <div className="ios-list" key={a.id}>
                <div className="ios-row ios-row-static">
                  <div className="prov-row-main prov-row-main-solto">
                    <strong>{a.description}</strong>
                    <small>
                      {dinheiro(a.amountCents, a.currency)}/{a.billingCycle === "YEARLY" ? "ano" : "mês"} · vence dia {a.billingDay} · desde {dataCurta(a.startedAt)}
                      {a.salesCommissionPercent !== null ? ` · mais ${String(a.salesCommissionPercent).replace(".", ",")}% sobre as vendas` : ""}
                      {a.productKey ? ` · ${a.productKey}` : ""}
                    </small>
                  </div>
                  <Pill status={a.status} />
                </div>
                {a.invoices.map((f) => {
                  const aberta = f.status === "OPEN" || f.status === "OVERDUE";
                  return (
                    <div className="ios-row ios-row-static prov-fatura" key={f.id}>
                      <div className="prov-row-main">
                        <strong>
                          {f.kind === "SETUP" ? "Implantação" : `Mensalidade ${f.competence}`} · {dinheiro(f.amountCents, a.currency)}
                        </strong>
                        <small>
                          Vence {dataCurta(f.dueDate)}
                          {f.paidAt ? ` · paga em ${dataCurta(f.paidAt)}` : ""}
                          {f.cobranca ? ` · última cobrança: ${f.cobranca.method} ${f.cobranca.status}` : ""}
                        </small>
                      </div>
                      <Pill status={f.status} />
                      {aberta ? (
                        <span className="prov-fatura-acoes">
                          {clienteNoBrasil ? (
                            <>
                              <button type="button" className="row-action" disabled={ocupado === "cobranca"} onClick={() => cobrar(a.id, f.id, "PIX", a.currency)}>
                                PIX
                              </button>
                              <button type="button" className="row-action" disabled={ocupado === "cobranca"} onClick={() => cobrar(a.id, f.id, "BOLETO", a.currency)}>
                                Boleto
                              </button>
                            </>
                          ) : (
                            <button type="button" className="row-action" disabled={ocupado === "cobranca"} onClick={() => cobrar(a.id, f.id, "PAYPAL", a.currency)}>
                              PayPal
                            </button>
                          )}
                          <button type="button" className="row-action" disabled={ocupado === "cobranca"} onClick={() => registrarPagamento(f.id)}>
                            Registrar pagamento
                          </button>
                          <button
                            type="button"
                            className="text-button prov-perigo"
                            disabled={ocupado === "cobranca"}
                            onClick={() => cancelarFatura(a.id, f.id, f.kind === "SETUP" ? "Implantação" : `Mensalidade ${f.competence}`)}
                          >
                            Cancelar fatura
                          </button>
                        </span>
                      ) : null}
                      {f.status !== "CANCELLED" ? (
                        <span className="prov-fatura-acoes">
                          <button type="button" className="text-button" disabled={ocupado === "cobranca"} onClick={() => enviarPor(f.id, Boolean(f.cobranca), "teste")}>
                            Enviar teste
                          </button>
                          <button type="button" className="text-button" disabled={ocupado === "cobranca"} onClick={() => enviarPor(f.id, Boolean(f.cobranca), "cliente")}>
                            Enviar ao cliente
                          </button>
                        </span>
                      ) : null}
                    </div>
                  );
                })}
                <div className="ios-row ios-row-static prov-assinatura-acoes">
                  {a.status === "ACTIVE" ? (
                    <>
                      <button type="button" className="text-button" disabled={ocupado === "cobranca"} onClick={() => agir(a.id, "gerar-fatura")}>
                        Fatura do mês
                      </button>
                      <button type="button" className="text-button" disabled={ocupado === "cobranca"} onClick={() => criarImplantacao(a.id)}>
                        Criar implantação
                      </button>
                      <button type="button" className="text-button" disabled={ocupado === "cobranca"} onClick={() => ajustarValor(a.id, a.amountCents, a.billingCycle)}>
                        Alterar valor
                      </button>
                      <button type="button" className="text-button" disabled={ocupado === "cobranca"} onClick={() => ajustarComissao(a.id, a.salesCommissionPercent)}>
                        Comissão sobre vendas
                      </button>
                      <button type="button" className="text-button" disabled={ocupado === "cobranca"} onClick={() => agir(a.id, "pausar")}>
                        Pausar
                      </button>
                    </>
                  ) : a.status === "PAUSED" ? (
                    <button type="button" className="text-button" disabled={ocupado === "cobranca"} onClick={() => agir(a.id, "retomar")}>
                      Retomar
                    </button>
                  ) : null}
                  {a.status !== "CANCELLED" ? (
                    <button type="button" className="text-button prov-perigo" disabled={ocupado === "cobranca"} onClick={() => setAssinaturaParaCancelar(a.id)}>
                      Cancelar
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </Cartao>

        <Cartao
          titulo="Etapas do onboarding"
          resultado={null}
          acoes={null}
        >
          <div className="ios-list">
            {etapas.length === 0 ? (
              <p className="prov-empty">As etapas aparecem na primeira ação de provisionamento.</p>
            ) : (
              etapas.map((e) => (
                <div className="ios-row ios-row-static" key={e.stepKey}>
                  <div className="prov-row-main">
                    <strong>{e.label}</strong>
                    <small>{e.completedAt ? `Concluída em ${dataCurta(e.completedAt)}${e.notes ? ` · ${e.notes}` : ""}` : e.notes ?? "Pendente"}</small>
                  </div>
                  <Pill status={e.status} />
                </div>
              ))
            )}
          </div>
        </Cartao>

        <Cartao
          titulo="Marcas"
          resultado={resultados.marcas ?? null}
          acoes={
            <button type="button" className="secondary-button" onClick={() => setFolha("marca")}>
              <Icone nome="adicionar" tamanho={18} />
              Nova marca
            </button>
          }
        >
          <div className="ios-list">
            {marcas.length === 0 ? (
              <p className="prov-empty">Nenhuma marca.</p>
            ) : (
              marcas.map((m) => (
                <div className="ios-row ios-row-static" key={m.id}>
                  <div className="prov-row-main">
                    <strong>{m.name}</strong>
                    <small>{m.siteUrl ?? m.slug}</small>
                  </div>
                  <Pill status={m.status} />
                </div>
              ))
            )}
          </div>
        </Cartao>

        <Cartao
          titulo="Cofre de credenciais"
          resultado={resultados.cofre ?? null}
          acoes={
            <button type="button" className="secondary-button" disabled={!cofreDisponivel} onClick={() => setFolha("credencial")}>
              <Icone nome="adicionar" tamanho={18} />
              Guardar credencial
            </button>
          }
        >
          <div className="ios-list">
            {!cofreDisponivel ? (
              <p className="prov-empty">Cofre fechado: falta a chave de cifra no servidor.</p>
            ) : credenciais.length === 0 ? (
              <p className="prov-empty">Nenhuma credencial guardada.</p>
            ) : (
              credenciais.map((c) => (
                <div className="ios-row ios-row-static" key={c.id}>
                  <div className="prov-row-main">
                    <strong>{c.provider}</strong>
                    <small>
                      {[c.accountName, c.externalId, c.tokenExpiresAt ? `vale até ${dataCurta(c.tokenExpiresAt)}` : null, c.nota].filter(Boolean).join(" · ") || `atualizada ${dataCurta(c.updatedAt)}`}
                    </small>
                  </div>
                  <Pill status={c.temSegredo ? c.status : "PENDING"} />
                  <button type="button" className="text-button prov-perigo" disabled={ocupado === "cofre"} onClick={() => setCredencialParaRemover(c.provider)}>
                    Remover
                  </button>
                </div>
              ))
            )}
          </div>
        </Cartao>
      </div>

      {folha === "assinatura" ? (
        <Sheet titulo="Nova assinatura" aoFechar={fecharFolha} rodape={rodape("form-assinatura", "Criar assinatura", "cobranca")}>
          <form id="form-assinatura" className="form-stack" onSubmit={enviarAssinatura}>
            <label className="field field-select">
              <span>Plano do catálogo</span>
              <select value={formAssinatura.planoId} onChange={(e) => escolherPlano(e.target.value)}>
                <option value="">Escolher (preenche descrição e valor)</option>
                {planosRecorrentes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} - {p.priceCents !== null ? dinheiro(p.priceCents, p.currency) : "a definir"} ({rotuloCiclo[p.billingCycle ?? ""] ?? p.billingCycle})
                  </option>
                ))}
              </select>
              <Icone nome="chevron" tamanho={16} className="chevron" />
            </label>
            <label className="field">
              <span>Descrição</span>
              <input value={formAssinatura.descricao} onChange={(e) => setFormAssinatura((f) => ({ ...f, descricao: e.target.value }))} placeholder={`Plataforma Ávila Ops - ${nomeCliente}`} required autoFocus />
            </label>
            <div className="field-grid">
              <label className="field field-select">
                <span>Cobrança</span>
                <select
                  value={formAssinatura.ciclo}
                  onChange={(e) => setFormAssinatura((f) => ({ ...f, ciclo: e.target.value }))}
                >
                  <option value="MONTHLY">Mensal</option>
                  <option value="YEARLY">Anual</option>
                </select>
              </label>
              <label className="field">
                <span>{anual ? "Valor anual" : "Valor mensal"}</span>
                <span className="input-prefix">
                  <i aria-hidden="true">R$</i>
                  <input value={formAssinatura.valor} onChange={(e) => setFormAssinatura((f) => ({ ...f, valor: e.target.value }))} placeholder="0,00" inputMode="decimal" required />
                </span>
              </label>
            </div>
            <div className="field-grid">
              <label className="field">
                <span>Dia do vencimento</span>
                <input type="number" min={1} max={28} value={formAssinatura.dia} onChange={(e) => setFormAssinatura((f) => ({ ...f, dia: e.target.value }))} inputMode="numeric" required />
                <small className="field-help">
                  {anual ? "1 a 28, no mês de aniversário." : "1 a 28."}
                </small>
              </label>
            </div>
            <label className="field">
              <span>Início</span>
              <input type="date" value={formAssinatura.inicio} onChange={(e) => setFormAssinatura((f) => ({ ...f, inicio: e.target.value }))} />
            </label>
            <div className="field-grid">
              <label className="field field-select">
                <span>Implantação (opcional)</span>
                <select value={formAssinatura.implantacaoPlanoId} onChange={(e) => escolherImplantacao(e.target.value)}>
                  <option value="">Sem plano</option>
                  {planosUnicos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} - {p.priceCents !== null ? dinheiro(p.priceCents, p.currency) : "a definir"}
                    </option>
                  ))}
                </select>
                <Icone nome="chevron" tamanho={16} className="chevron" />
              </label>
              <label className="field">
                <span>Valor da implantação</span>
                <span className="input-prefix">
                  <i aria-hidden="true">R$</i>
                  <input value={formAssinatura.implantacao} onChange={(e) => setFormAssinatura((f) => ({ ...f, implantacao: e.target.value }))} placeholder="0,00" inputMode="decimal" />
                </span>
                <small className="field-help">Vence em 7 dias. Vazio = sem implantação.</small>
              </label>
            </div>
            <div className="field-grid">
              <label className="field">
                <span>Produto (opcional)</span>
                <input value={formAssinatura.produto} onChange={(e) => setFormAssinatura((f) => ({ ...f, produto: e.target.value }))} placeholder="ex.: minas" className="mono" autoCapitalize="none" />
              </label>
              <label className="field">
                <span>Tenant no produto</span>
                <input value={formAssinatura.tenant} onChange={(e) => setFormAssinatura((f) => ({ ...f, tenant: e.target.value }))} placeholder="UUID do tenant" className="mono" autoCapitalize="none" />
              </label>
            </div>
            <p className="field-help">Produto + tenant é o que deixa o Comandeiro (ou outro produto) perguntar “qual é a fatura do meu cliente?”. Só preencha se o cliente usa um produto da casa.</p>
            {resultados.cobranca?.tipo === "erro" ? (
              <p className="inline-feedback feedback-error" role="alert">{resultados.cobranca.conteudo}</p>
            ) : null}
          </form>
        </Sheet>
      ) : null}

      {folha === "marca" ? (
        <Sheet titulo="Nova marca" aoFechar={fecharFolha} rodape={rodape("form-marca", "Criar marca", "marcas")}>
          <form id="form-marca" className="form-stack" onSubmit={enviarMarca}>
            <label className="field">
              <span>Nome</span>
              <input value={formMarca.name} onChange={(e) => setFormMarca((f) => ({ ...f, name: e.target.value }))} required autoFocus />
            </label>
            <label className="field">
              <span>Site (opcional)</span>
              <input value={formMarca.siteUrl} onChange={(e) => setFormMarca((f) => ({ ...f, siteUrl: e.target.value }))} placeholder="https://" inputMode="url" autoCapitalize="none" />
            </label>
            {resultados.marcas?.tipo === "erro" ? (
              <p className="inline-feedback feedback-error" role="alert">{resultados.marcas.conteudo}</p>
            ) : null}
          </form>
        </Sheet>
      ) : null}

      {folha === "credencial" ? (
        <Sheet titulo="Guardar credencial" aoFechar={fecharFolha} rodape={rodape("form-credencial", "Guardar", "cofre")}>
          <form id="form-credencial" className="form-stack" onSubmit={enviarCredencial}>
            <label className="field">
              <span>Provedor</span>
              <input
                value={formCredencial.provider}
                onChange={(e) => setFormCredencial((f) => ({ ...f, provider: e.target.value }))}
                placeholder="openai, cloudflare, meta…"
                list="prov-provedores"
                autoCapitalize="none"
                autoComplete="off"
                className="mono"
                required
                autoFocus
              />
              <datalist id="prov-provedores">
                {provedoresSugeridos.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              <small className="field-help">Um por provedor por cliente; guardar de novo substitui o segredo.</small>
            </label>
            <div className="field-grid">
              <label className="field">
                <span>Rótulo (conta)</span>
                <input value={formCredencial.accountName} onChange={(e) => setFormCredencial((f) => ({ ...f, accountName: e.target.value }))} placeholder="ex.: conta do cliente" />
              </label>
              <label className="field">
                <span>Identificador</span>
                <input value={formCredencial.externalId} onChange={(e) => setFormCredencial((f) => ({ ...f, externalId: e.target.value }))} placeholder="projeto, account id…" className="mono" autoCapitalize="none" />
              </label>
            </div>
            <label className="field">
              <span>Segredo</span>
              <input type="password" value={formCredencial.segredo} onChange={(e) => setFormCredencial((f) => ({ ...f, segredo: e.target.value }))} placeholder="chave, token ou senha" autoComplete="new-password" className="mono" />
              <small className="field-help">Cifrado com AES-256-GCM no banco. Não é exibido depois.</small>
            </label>
            <div className="field-grid">
              <label className="field">
                <span>Validade (opcional)</span>
                <input type="date" value={formCredencial.validade} onChange={(e) => setFormCredencial((f) => ({ ...f, validade: e.target.value }))} />
              </label>
              <label className="field">
                <span>Observação</span>
                <input value={formCredencial.nota} onChange={(e) => setFormCredencial((f) => ({ ...f, nota: e.target.value }))} placeholder="onde foi gerada, escopo…" />
              </label>
            </div>
            {resultados.cofre?.tipo === "erro" ? (
              <p className="inline-feedback feedback-error" role="alert">{resultados.cofre.conteudo}</p>
            ) : null}
          </form>
        </Sheet>
      ) : null}

      {assinaturaParaCancelar ? (
        <Confirmacao
          titulo="Cancelar assinatura"
          descricao="A assinatura para de gerar cobrança e as faturas em aberto também são canceladas."
          rotuloConfirmar="Cancelar assinatura"
          confirmando={ocupado === "cobranca"}
          aoConfirmar={() => void agir(assinaturaParaCancelar, "cancelar")}
          aoCancelar={() => setAssinaturaParaCancelar(null)}
        />
      ) : null}

      {credencialParaRemover ? (
        <Confirmacao
          titulo="Remover credencial"
          alvo={credencialParaRemover}
          descricao="O segredo guardado no cofre é apagado e não dá para recuperá-lo; a integração para de funcionar até alguém cadastrar outro."
          rotuloConfirmar="Remover"
          confirmando={ocupado === "cofre"}
          aoConfirmar={() => void removerCredencial(credencialParaRemover)}
          aoCancelar={() => setCredencialParaRemover(null)}
        />
      ) : null}

      {aviso ? (
        <div className="toast" role="status">
          {aviso}
        </div>
      ) : null}
    </section>
  );
}
