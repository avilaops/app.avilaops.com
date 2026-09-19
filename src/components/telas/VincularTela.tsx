"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Sheet from "@/components/ui/Sheet";

/**
 * Aprova o código que está piscando numa TV em algum lugar.
 *
 * É o único caminho pelo qual uma tela entra: ninguém digita token, ninguém
 * faz login no aparelho. A tela mostra seis letras, e alguém com acesso a este
 * painel diz "essa é minha, o nome dela é X". O token nasce do outro lado e
 * nunca chega aqui.
 *
 * O campo de origens fica recolhido de propósito: quase toda tela herda a
 * allowlist do agente, e oferecer o campo aberto convidaria a preencher sem
 * necessidade — uma allowlist própria que alguém esqueceu de atualizar é como
 * o comando `exibir` começa a recusar endereço legítimo.
 */
export default function VincularTela({ codigo, dica }: { codigo: string; dica: string }) {
  const router = useRouter();
  const [aberta, setAberta] = useState(false);
  const [nome, setNome] = useState("");
  const [origens, setOrigens] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function vincular() {
    const limpo = nome.trim();
    if (!limpo) {
      setErro("Dê um nome para a tela.");
      return;
    }
    setEnviando(true);
    setErro("");
    try {
      const r = await fetch("/api/telas/parear", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          codigo,
          nome: limpo,
          origens: origens.split(/[\s,]+/).map((o) => o.trim()).filter(Boolean),
        }),
      });
      const corpo = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(corpo.error ?? "Não consegui vincular a tela.");
      setAberta(false);
      setNome("");
      setOrigens("");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui vincular a tela.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <button type="button" className="row-action" onClick={() => setAberta(true)}>
        Vincular
      </button>

      {aberta && (
        <Sheet
          titulo={`Vincular a tela ${codigo}`}
          aoFechar={() => setAberta(false)}
          rodape={
            <>
              <button type="button" className="primary-button" onClick={vincular} disabled={enviando}>
                {enviando ? "Vinculando…" : "Vincular tela"}
              </button>
              <button type="button" className="secondary-button" onClick={() => setAberta(false)} disabled={enviando}>
                Cancelar
              </button>
            </>
          }
        >
          <div className="form-stack">
            <p className="field-help">{dica}</p>

            <label className="field">
              <span>Nome da tela</span>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Tela da cozinha"
                autoFocus
                maxLength={60}
              />
            </label>
            <p className="field-help">
              O nome aparece aqui e no relatório semanal. Use o lugar, não o modelo do aparelho.
            </p>

            <details className="detalhes-tecnicos">
              <summary>Allowlist própria (opcional)</summary>
              <label className="field">
                <span>Endereços que esta tela pode abrir</span>
                <input
                  value={origens}
                  onChange={(e) => setOrigens(e.target.value)}
                  placeholder="https://brasa.comandeiro.com.br/tv"
                  inputMode="url"
                />
              </label>
              <p className="field-help">
                Separados por vírgula. Em branco, a tela herda a allowlist do agente — que é o que você quer em
                quase todo caso.
              </p>
            </details>

            {erro ? (
              <p className="inline-feedback feedback-error" role="alert">
                {erro}
              </p>
            ) : null}
          </div>
        </Sheet>
      )}
    </>
  );
}
