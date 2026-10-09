"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/shadcn/button";

/**
 * Cria a mensalidade de uma loja que ainda não tem, e mostra o link de cartão.
 *
 * A assinatura do Mercado Pago só passa a cobrar depois que o lojista cadastra
 * o cartão nesse link — criar aqui não debita ninguém. Por isso o resultado não
 * é "pronto", é o link para mandar: sem ele a mensalidade fica "aguardando
 * cartão" para sempre e ninguém entende por quê.
 */
export default function CriarMensalidade({ slug, nome, plano }: { slug: string; nome: string; plano: string }) {
  const router = useRouter();
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function criar() {
    setCriando(true);
    setErro(null);
    try {
      const r = await fetch("/api/mercadopago/assinatura", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, acao: "iniciar" }),
      });
      const d = (await r.json().catch(() => ({}))) as { erro?: string; initPoint?: string | null };
      if (!r.ok) throw new Error(d.erro ?? "Não consegui criar a mensalidade.");
      setLink(d.initPoint ?? null);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui criar a mensalidade.");
    } finally {
      setCriando(false);
    }
  }

  async function copiar() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sem área de transferência o link segue na tela, selecionável.
    }
  }

  if (link) {
    return (
      <div className="grid min-w-0 max-w-[280px] gap-1.5 text-[12px] text-muted-foreground">
        <span>Mensalidade criada. Mande este link para {nome} cadastrar o cartão:</span>
        <code className="[overflow-wrap:anywhere] text-foreground">{link}</code>
        <Button type="button" variant="outline" size="sm" className="min-h-9 justify-self-start" onClick={() => void copiar()}>
          {copiado ? "Copiado" : "Copiar link"}
        </Button>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 max-w-[280px] justify-items-end gap-1.5 max-[899px]:justify-items-start">
      <Button type="button" variant="outline" size="sm" className="min-h-9" disabled={criando} onClick={() => void criar()}>
        {criando ? "Criando…" : "Criar mensalidade"}
      </Button>
      <span className="text-[12px] text-muted-foreground">Plano {plano}. Só cobra depois do cartão cadastrado.</span>
      {erro ? <span className="text-[12px] text-destructive">{erro}</span> : null}
    </div>
  );
}
