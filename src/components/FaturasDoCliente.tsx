"use client";

import { useState } from "react";

type Cobranca = {
  metodo: string;
  pixCopiaECola: string | null;
  boletoUrl: string | null;
  expiraEm: string | null;
};

export type FaturaDoCliente = {
  id: string;
  descricao: string;
  competencia: string;
  tipo: string;
  valor: number;
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
export default function FaturasDoCliente({ iniciais }: { iniciais: FaturaDoCliente[] }) {
  const [faturas, setFaturas] = useState(iniciais);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiada, setCopiada] = useState<string | null>(null);

  if (faturas.length === 0) {
    return (
      <section className="portal-card">
        <h2>Suas faturas</h2>
        <p className="portal-muted">Nenhuma fatura emitida ainda.</p>
      </section>
    );
  }

  async function cobrar(fatura: FaturaDoCliente, metodo: "PIX" | "BOLETO") {
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
    <section className="portal-card">
      <h2>Suas faturas</h2>
      {erro && <p className="portal-erro">{erro}</p>}

      <ul className="portal-list portal-faturas">
        {faturas.map((fatura) => {
          const aberta = fatura.status === "OPEN" || fatura.status === "OVERDUE";
          const cobranca = fatura.cobranca;
          return (
            <li key={fatura.id}>
              <span>
                {rotuloTipo(fatura.tipo)} {fatura.competencia}
                <small className="portal-muted"> {fatura.descricao}</small>
              </span>
              <em>
                {dinheiro(fatura.valor)} · {rotuloStatus(fatura.status)}
                {fatura.status === "PAID" && fatura.pagaEm
                  ? ` em ${data(fatura.pagaEm)}`
                  : ` · vence ${data(fatura.vencimento)}`}
              </em>

              {aberta && !cobranca && (
                <div className="portal-acoes">
                  <button type="button" onClick={() => cobrar(fatura, "PIX")} disabled={ocupada === fatura.id}>
                    {ocupada === fatura.id ? "Gerando…" : "Pagar com Pix"}
                  </button>
                  <button
                    type="button"
                    className="secundario"
                    onClick={() => cobrar(fatura, "BOLETO")}
                    disabled={ocupada === fatura.id}
                  >
                    Gerar boleto
                  </button>
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
            </li>
          );
        })}
      </ul>

      <p className="portal-muted">
        O pagamento é confirmado automaticamente. Se demorar mais de uma hora para dar baixa, fale
        com a gente que resolvemos.
      </p>
    </section>
  );
}

function rotuloTipo(tipo: string) {
  return tipo === "SETUP" ? "Implantação" : "Mensalidade";
}

function rotuloStatus(status: string) {
  const mapa: Record<string, string> = {
    OPEN: "em aberto",
    OVERDUE: "vencida",
    PAID: "paga",
    CANCELLED: "cancelada",
  };
  return mapa[status] ?? status.toLowerCase();
}

function dinheiro(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function data(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
