"use client";

import { useState } from "react";

/**
 * Botão de diagnóstico do PayPal: pergunta ao servidor (OAuth + webhook) e
 * mostra verde/vermelho na hora. É o check que antes só dava para fazer por SSH.
 */

type Diagnostico = {
  ambiente: string;
  configurado: boolean;
  oauthOk: boolean;
  webhookId: string | null;
  webhookUrl: string | null;
  eventos: string[];
  erro: string | null;
};

export default function DiagnosticoPaypal() {
  const [carregando, setCarregando] = useState(false);
  const [diag, setDiag] = useState<Diagnostico | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function diagnosticar() {
    setCarregando(true);
    setErro(null);
    try {
      const resposta = await fetch("/api/integracoes/paypal/diagnostico");
      const dados = (await resposta.json()) as Diagnostico & { erro?: string };
      if (!resposta.ok) {
        setErro(dados.erro ?? "Falhou.");
        setDiag(null);
      } else {
        setDiag(dados);
      }
    } catch {
      setErro("Sem resposta do servidor.");
    } finally {
      setCarregando(false);
    }
  }

  const saudavel = diag ? diag.oauthOk && !diag.erro : false;

  return (
    <section className="w-full rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-foreground">Saúde do PayPal</h2>
          <p className="text-[13px] text-muted-foreground">Confere credencial e webhook sem depender de pagamento.</p>
        </div>
        <button
          type="button"
          onClick={diagnosticar}
          disabled={carregando}
          className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
        >
          {carregando ? "Diagnosticando…" : "Diagnosticar agora"}
        </button>
      </div>

      {diag ? (
        <ul className="mt-3 space-y-1 text-[13px] text-foreground">
          <li>
            Situação:{" "}
            <strong className={saudavel ? "text-emerald-600" : "text-red-600"}>
              {saudavel ? "saudável" : "com problema"}
            </strong>
          </li>
          <li>Ambiente: <strong>{diag.ambiente}</strong></li>
          <li>Credencial (OAuth): {diag.oauthOk ? "✅" : "❌"}</li>
          <li className="break-all">Webhook: {diag.webhookUrl ?? diag.webhookId ?? "não configurado"}</li>
          <li className="break-words">Eventos assinados: {diag.eventos.length ? diag.eventos.join(", ") : "—"}</li>
          {diag.erro ? <li className="text-red-600">Erro: {diag.erro}</li> : null}
        </ul>
      ) : null}

      {erro ? <p className="mt-2 text-[13px] text-red-600">{erro}</p> : null}
    </section>
  );
}
