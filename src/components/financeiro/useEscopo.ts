"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { SCOPE_LABELS, type FinanceScope } from "@/lib/finance-escopo";

/**
 * Troca o escopo de uma movimentação com resposta otimista: a tela muda na
 * hora e volta atrás, com aviso, se a gravação falhar. A rota grava
 * `scope_source = MANUAL`, que a reimportação respeita.
 */
export function useEscopo(transactionId: string, inicial: string) {
  const router = useRouter();
  const [escopo, setEscopo] = useState(inicial);
  const [salvando, setSalvando] = useState(false);

  async function mudar(proximo: FinanceScope) {
    if (proximo === escopo) return;
    const anterior = escopo;
    setEscopo(proximo);
    setSalvando(true);
    try {
      const resposta = await fetch(`/api/bank-transactions/${transactionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope: proximo }),
      });
      if (!resposta.ok) throw new Error();
      toast.success(`Marcada como ${SCOPE_LABELS[proximo]}.`);
      router.refresh();
    } catch {
      setEscopo(anterior);
      toast.error("O escopo não foi salvo. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return { escopo, salvando, mudar };
}
