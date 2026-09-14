"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Ações sobre a mensalidade de uma loja.
 *
 * Nenhuma delas fala com o Mercado Pago daqui. Todas vão para o
 * lojas.avilaops.com, que é quem sabe suspender a loja, gravar o histórico e
 * avisar o lojista no mesmo movimento — cancelar direto no MP deixaria os dois
 * lados discordando até a varredura do dia seguinte.
 */
type Acao = "cancelar" | "pausar" | "retomar" | "valor";

export default function AcoesAssinatura({
  slug,
  nome,
  status,
  valorCentavos,
}: {
  slug: string;
  nome: string;
  status: string;
  valorCentavos: number;
}) {
  const router = useRouter();
  const [enviando, comTransicao] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [editandoValor, setEditandoValor] = useState(false);
  const [valor, setValor] = useState((valorCentavos / 100).toFixed(2).replace(".", ","));

  async function executar(acao: Acao, corpo?: Record<string, unknown>) {
    setErro(null);
    try {
      const r = await fetch("/api/mercadopago/assinatura", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, acao, ...corpo }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.erro ?? "Não consegui aplicar.");
      setEditandoValor(false);
      comTransicao(() => router.refresh());
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falhou.");
    }
  }

  // Cancelar é o único caminho sem volta: o cartão é desvinculado e o lojista
  // precisa cadastrar de novo. Por isso confirma pelo nome da loja.
  function cancelar() {
    if (!window.confirm(`Cancelar a mensalidade de ${nome}?\n\nO cartão é desvinculado e a loja será suspensa na próxima varredura. Não dá para desfazer - ele terá que assinar de novo.`)) return;
    void executar("cancelar");
  }

  return (
    <div className="ledger-actions">
      {status === "authorized" && (
        <button type="button" className="text-button" disabled={enviando} onClick={() => void executar("pausar")}>
          Pausar
        </button>
      )}
      {status === "paused" && (
        <button type="button" className="text-button" disabled={enviando} onClick={() => void executar("retomar")}>
          Retomar
        </button>
      )}
      {status !== "cancelled" && (
        <>
          <button type="button" className="text-button" disabled={enviando} onClick={() => setEditandoValor((v) => !v)}>
            Valor
          </button>
          <button type="button" className="danger-button" disabled={enviando} onClick={cancelar}>
            Cancelar
          </button>
        </>
      )}

      {editandoValor && (
        <form
          className="mp-valor"
          onSubmit={(e) => {
            e.preventDefault();
            const centavos = Math.round(Number.parseFloat(valor.replace(/\./g, "").replace(",", ".")) * 100);
            if (!Number.isFinite(centavos) || centavos < 100) return setErro("Valor inválido.");
            void executar("valor", { centavos });
          }}
        >
          <label>
            Novo valor mensal
            <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" aria-label="Novo valor mensal" />
          </label>
          <button type="submit" className="small-primary" disabled={enviando}>
            Aplicar
          </button>
          <p className="mp-nota">
            Vale a partir da próxima cobrança. É também o caminho de ligar um adicional: soma ao plano
            em vez de criar uma segunda assinatura.
          </p>
        </form>
      )}

      {erro && <p className="form-error">{erro}</p>}
    </div>
  );
}
