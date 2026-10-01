"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/shadcn/button";
import { ACOES, BOTAO, MensagemErro, MensagemStatus } from "@/components/hub-social/comum";

/**
 * O botão que roda a auditoria de ícones de um domínio. Só isto precisa ser
 * cliente: o checklist inteiro é desenhado no servidor a partir do que está
 * gravado, e depois da auditoria a página é recarregada para mostrar o novo.
 */
export default function PainelIcones({ fqdn }: { fqdn: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [falhou, setFalhou] = useState(false);

  async function auditar() {
    setOcupado(true);
    setMensagem("");
    setFalhou(false);
    try {
      const res = await fetch("/api/integrations/icones/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fqdn }),
      });
      const dados = await res.json();
      if (!res.ok || !dados.success) {
        throw new Error(dados.error || "Falha ao auditar os ícones.");
      }
      setMensagem(`Conjunto de ${fqdn} conferido: ${dados.result.nota}/100.`);
      router.refresh();
    } catch (erro) {
      setMensagem(erro instanceof Error ? erro.message : "Falha ao auditar os ícones.");
      setFalhou(true);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className={ACOES}>
        <Button type="button" onClick={auditar} disabled={ocupado} className={BOTAO}>
          {ocupado ? "Conferindo..." : "Conferir o conjunto"}
        </Button>
      </div>
      {mensagem ? falhou ? <MensagemErro>{mensagem}</MensagemErro> : <MensagemStatus>{mensagem}</MensagemStatus> : null}
    </div>
  );
}
