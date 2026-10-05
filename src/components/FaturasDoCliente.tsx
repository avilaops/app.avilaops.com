"use client";

import { useState } from "react";

type Cobranca = {
  metodo: string;
  pixCopiaECola: string | null;
  boletoUrl: string | null;
  checkoutUrl: string | null;
  expiraEm: string | null;
};

export type FaturaDoCliente = {
  id: string;
  descricao: string;
  competencia: string;
  tipo: string;
  valor: number;
  saldo: number;
  moeda: string;
  vencimento: string;
  status: string;
  pagaEm: string | null;
  cobranca: Cobranca | null;
};

/**
 * As faturas do cliente, com o Pix na mão dele.
 *
 * Antes, quem quisesse pagar pedia o código por WhatsApp e esperava alguém da
 * casa abrir o painel. Cobrança que o cliente não consegue pagar sozinho é
 * atrito nosso, não dele.
 *
 * Se já existe cobrança pendente, ela é reaproveitada em vez de gerar um Pix
 * novo a cada clique: dois códigos para a mesma fatura confundem quem paga e
 * sujam a conciliação.
 */
export default function FaturasDoCliente({ iniciais, pais }: { iniciais: FaturaDoCliente[]; pais: string }) {
  const [faturas, setFaturas] = useState(iniciais);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiada, setCopiada] = useState<string | null>(null);
  const paisNormalizado = pais.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const brasileira = ["BR", "BRA", "BRASIL", "BRAZIL", ""].includes(paisNormalizado);

  if (faturas.length === 0) {
    return (
      <section className="portal-card" id="faturas">
        <h2>Suas faturas</h2>
        <p className="portal-muted">Nenhuma fatura emitida ainda.</p>
      </section>
    );
  }

  async function cobrar(fatura: FaturaDoCliente, metodo: "PIX" | "BOLETO" | "PAYPAL") {
    setOcupada(fatura.id);
    setErro(null);
    try {
      const resposta = await fetch(`/api/portal/faturas/${fatura.id}/cobrar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ metodo }),
      });
      const dados = (await resposta.json()) as {
        erro?: string;
        metodo?: string;
        pixCopiaECola?: string | null;
        boletoUrl?: string | null;
        checkoutUrl?: string | null;
        expiraEm?: string | null;
      };
      if (!resposta.ok) {
        setErro(dados.erro ?? "Não consegui gerar a cobrança agora.");
        return;
      }
      setFaturas((atuais) =>
        atuais.map((f) =>
          f.id === fatura.id
            ? {
                ...f,
                cobranca: {
                  metodo: dados.metodo ?? metodo,
                  pixCopiaECola: dados.pixCopiaECola ?? null,
                  boletoUrl: dados.boletoUrl ?? null,
                  checkoutUrl: dados.checkoutUrl ?? null,
                  expiraEm: dados.expiraEm ?? null,
                },
              }
            : f,
        ),
      );
    } catch {
      setErro("Não consegui falar com o servidor. Confira a conexão e tente de novo.");
    } finally {
      setOcupada(null);
    }
  }

  async function copiar(fatura: FaturaDoCliente) {
    const codigo = fatura.cobranca?.pixCopiaECola;
    if (!codigo) return;
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiada(fatura.id);
      window.setTimeout(() => setCopiada(null), 2500);
    } catch {
      setErro("Seu navegador não deixou copiar. Selecione o código e copie à mão.");
    }
  }

  return (
    <section className="portal-card" id="faturas" aria-busy={ocupada !== null}>
      <h2>Suas faturas</h2>
      {erro && <p className="portal-erro" role="alert">{erro}</p>}
      <p className="portal-sr-only" role="status">{copiada ? "Código Pix copiado." : ocupada ? "Preparando pagamento…" : ""}</p>

      <ul className="portal-list portal-faturas">
        {faturas.map((fatura) => {
          const aberta = fatura.status === "OPEN" || fatura.status === "OVERDUE";
          const cobranca = fatura.cobranca;
          return (
            <li key={fatura.id} className={fatura.status === "OVERDUE" ? "portal-invoice-overdue" : undefined}>
              <span>
                {rotuloTipo(fatura.tipo)} {fatura.competencia}
                <small className="portal-muted"> {fatura.descricao}</small>
              </span>
              <em>
                <strong>{dinheiro(fatura.valor, fatura.moeda)}</strong> · <span className="portal-invoice-status">{rotuloStatus(fatura.status)}</span>
                {fatura.status === "PAID" && fatura.pagaEm
                  ? ` em ${data(fatura.pagaEm)}`
                  : ` · ${fatura.status === "OVERDUE" ? "venceu" : "vence"} ${data(fatura.vencimento)}`}
              </em>

              {aberta && fatura.saldo < fatura.valor && (
                <p className="portal-muted">Saldo restante: {dinheiro(fatura.saldo, fatura.moeda)}. Fale com o atendimento para pagar o saldo.</p>
              )}
              {aberta && fatura.saldo === fatura.valor && !cobranca && (
                <div className="portal-acoes">
                  {brasileira && fatura.moeda === "BRL" ? (
                    <>
                      <button type="button" onClick={() => cobrar(fatura, "PIX")} disabled={ocupada !== null}>
                        {ocupada === fatura.id ? "Gerando…" : "Pagar com Pix"}
                      </button>
                      <button type="button" className="secundario" onClick={() => cobrar(fatura, "BOLETO")} disabled={ocupada !== null}>
                        Gerar boleto
                      </button>
                    </>
                  ) : !brasileira ? (
                    <button type="button" onClick={() => cobrar(fatura, "PAYPAL")} disabled={ocupada !== null}>
                      {ocupada === fatura.id ? "Preparando…" : "Pagar com PayPal"}
                    </button>
                  ) : <p className="portal-muted">Fale com o atendimento para pagar nesta moeda.</p>}
                </div>
              )}

              {aberta && cobranca?.pixCopiaECola && (
                <div className="portal-pix">
                  <code>{cobranca.pixCopiaECola}</code>
                  <button type="button" onClick={() => copiar(fatura)}>
                    {copiada === fatura.id ? "Copiado" : "Copiar código"}
                  </button>
                  {cobranca.expiraEm && (
                    <small className="portal-muted">O código vale até {data(cobranca.expiraEm)}.</small>
                  )}
                </div>
              )}

              {aberta && cobranca?.boletoUrl && (
                <div className="portal-acoes">
                  <a href={cobranca.boletoUrl} target="_blank" rel="noopener noreferrer">
                    Abrir boleto
                  </a>
                </div>
              )}

              {aberta && cobranca?.checkoutUrl && (
                <div className="portal-acoes">
                  <a href={cobranca.checkoutUrl}>Continuar no PayPal</a>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="portal-muted">
        {brasileira ? "Pagamentos no Brasil são processados pelo Mercado Pago. " : "Pagamentos fora do Brasil são processados pelo PayPal. "}
        Exibimos até 12 faturas; o total em aberto considera todas. O pagamento é confirmado automaticamente. Se demorar mais de uma hora para dar baixa, fale
        com a gente que resolvemos.
      </p>
    </section>
  );
}

function rotuloTipo(tipo: string) {
  return tipo === "SETUP" ? "Implantação" : "Assinatura";
}

function rotuloStatus(status: string) {
  const mapa: Record<string, string> = {
    OPEN: "em aberto",
    OVERDUE: "vencida",
    PAID: "paga",
    CANCELLED: "cancelada",
    AWAITING_RECONCILIATION: "pagamento recebido, aguardando conciliação",
  };
  return mapa[status] ?? status.toLowerCase();
}

function dinheiro(valor: number, moeda: string) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: moeda });
}

function data(iso: string) {
  // DATE do PostgreSQL é um dia civil, não um instante sujeito ao fuso local.
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric",
    timeZone: /^\d{4}-\d{2}-\d{2}$/.test(iso) ? "UTC" : "America/Sao_Paulo" });
}
