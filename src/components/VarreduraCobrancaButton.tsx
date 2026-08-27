"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Roda a varredura de cobrança sob demanda.
 *
 * Ela sincroniza o status de cada assinatura direto no Mercado Pago e monta as
 * faturas — é o que mantém a mensalidade funcionando mesmo com o webhook fora
 * do ar. Normalmente roda às 6h; este botão existe para quando alguém está com
 * o cliente na linha dizendo que pagou.
 */
export default function VarreduraCobrancaButton() {
  const router = useRouter();
  const [enviando, comTransicao] = useTransition();
  const [resultado, setResultado] = useState<string | null>(null);

  return (
    <div className="mp-varredura">
      <button
        type="button"
        className="small-primary"
        disabled={enviando}
        onClick={async () => {
          setResultado(null);
          try {
            const r = await fetch("/api/mercadopago/varredura", { method: "POST" });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.erro ?? "falhou");
            setResultado(
              `${d.sincronizadas} assinatura(s) conferida(s), ${d.faturasNovas} fatura(s) nova(s)` +
                (d.suspensas?.length ? `, ${d.suspensas.length} loja(s) suspensa(s)` : ""),
            );
            comTransicao(() => router.refresh());
          } catch (e) {
            setResultado(e instanceof Error ? e.message : "falhou");
          }
        }}
      >
        {enviando ? "Conferindo…" : "Conferir cobranças agora"}
      </button>
      {resultado && <p className="mp-nota">{resultado}</p>}
    </div>
  );
}
