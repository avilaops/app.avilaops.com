"use client";

import { useState } from "react";

/**
 * Botão de diagnóstico de uma integração: pergunta ao servidor e mostra
 * verde/vermelho na hora. Genérico — cada provedor tem sua rota, que devolve
 * sempre a mesma forma { ok, linhas, erro }.
 */

type Resultado = {
  ok: boolean;
  linhas: { rotulo: string; valor: string }[];
  erro: string | null;
};

export default function DiagnosticoIntegracao({ titulo, endpoint }: { titulo: string; endpoint: string }) {
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function diagnosticar() {
    setCarregando(true);
    setErro(null);
    try {
      const resposta = await fetch(endpoint);
      const dados = (await resposta.json()) as Resultado & { erro?: string };
      if (!resposta.ok) {
        setErro(dados.erro ?? "Falhou.");
        setResultado(null);
      } else {
        setResultado(dados);
      }
    } catch {
      setErro("Sem resposta do servidor.");
      setResultado(null); // não deixar um "saudável" velho ao lado do erro
    } finally {
      setCarregando(false);
    }
  }

  return (
    <section className="w-full rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-foreground">Saúde — {titulo}</h2>
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

      {resultado ? (
        <ul className="mt-3 space-y-1 text-[13px] text-foreground">
          <li>
            Situação:{" "}
            <strong className={resultado.ok ? "text-emerald-600" : "text-red-600"}>
              {resultado.ok ? "saudável" : "com problema"}
            </strong>
          </li>
          {resultado.linhas.map((l) => (
            <li key={l.rotulo} className="break-all">
              {l.rotulo}: {l.valor}
            </li>
          ))}
          {resultado.erro ? <li className="text-red-600">Erro: {resultado.erro}</li> : null}
        </ul>
      ) : null}

      {erro ? <p className="mt-2 text-[13px] text-red-600">{erro}</p> : null}
    </section>
  );
}
