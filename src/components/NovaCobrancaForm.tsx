"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Cria um link de cobrança avulsa e devolve a URL para copiar.
 *
 * O link aparece na tela em vez de só recarregar a lista: quem está criando
 * quase sempre está com o cliente na linha e precisa colar agora.
 */
export default function NovaCobrancaForm() {
  const router = useRouter();
  const [enviando, comTransicao] = useTransition();
  const [f, setF] = useState({ titulo: "", valor: "", referencia: "", email: "" });
  const [criado, setCriado] = useState<{ link: string; titulo: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const set = (k: keyof typeof f, v: string) => setF((atual) => ({ ...atual, [k]: v }));

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCriado(null);

    const centavos = Math.round(Number.parseFloat(f.valor.replace(/\./g, "").replace(",", ".")) * 100);
    if (!f.titulo.trim()) return setErro("Descreva o que está sendo cobrado — é o que o cliente vê.");
    if (!Number.isFinite(centavos) || centavos < 100) return setErro("Valor inválido (mínimo R$ 1,00).");

    try {
      const r = await fetch("/api/mercadopago/cobranca", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          titulo: f.titulo.trim(),
          centavos,
          referencia: f.referencia.trim() || undefined,
          email: f.email.trim() || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.erro ?? "Não consegui criar.");
      setCriado({ link: d.link, titulo: d.titulo });
      setF({ titulo: "", valor: "", referencia: "", email: "" });
      comTransicao(() => router.refresh());
    } catch (e2) {
      setErro(e2 instanceof Error ? e2.message : "Falhou.");
    }
  }

  return (
    <form className="mp-cobranca-form" onSubmit={enviar}>
      <label>
        O que está cobrando
        <input value={f.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="Setup da loja — Avila Ops" />
      </label>
      <label>
        Valor (R$)
        <input value={f.valor} onChange={(e) => set("valor", e.target.value)} placeholder="497,00" inputMode="decimal" />
      </label>
      <label>
        Referência <span>opcional, para você reconhecer depois</span>
        <input value={f.referencia} onChange={(e) => set("referencia", e.target.value)} placeholder="setup-vedashow" />
      </label>
      <label>
        E-mail de quem paga <span>opcional, só preenche o checkout</span>
        <input value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="cliente@empresa.com.br" type="email" />
      </label>

      <button type="submit" className="small-primary" disabled={enviando}>
        {enviando ? "Criando…" : "Criar link"}
      </button>

      {erro && <p className="form-error">{erro}</p>}

      {criado && (
        <div className="mp-sinal mp-sinal-ok">
          <strong>Link pronto — {criado.titulo}</strong>
          <p>
            <a href={criado.link} target="_blank" rel="noopener">
              {criado.link}
            </a>
          </p>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              navigator.clipboard?.writeText(criado.link).then(() => {
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2000);
              });
            }}
          >
            {copiado ? "Copiado" : "Copiar link"}
          </button>
        </div>
      )}
    </form>
  );
}
