"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Confirmacao from "@/components/sistema/Confirmacao";
import Sheet from "@/components/ui/Sheet";

/**
 * O que dá para fazer com uma tela sem ir até ela.
 *
 * São só os comandos de operação — recarregar, avisar quem está na frente da
 * tela e revogar. Trocar **o que** a tela exibe não mora aqui: isso é decisão
 * de conteúdo, passa pela allowlist do dispositivo e nasce no n8n. Este painel
 * é para quando alguém está olhando uma tela que deu problema.
 *
 * O resultado aparece na própria linha e não some sozinho: o comando tem TTL
 * de 60 s no protocolo, e "a tela respondeu ok" é a informação que o operador
 * veio buscar — um toast que evapora em três segundos a perderia.
 */
export default function AcoesDaTela({ id, nome, online }: { id: string; nome: string; online: boolean }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState("");
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [folhaAviso, setFolhaAviso] = useState(false);
  const [texto, setTexto] = useState("");
  const [confirmando, setConfirmando] = useState(false);

  async function comandar(comando: string, corpoExtra: Record<string, unknown> = {}) {
    setOcupado(comando);
    setAviso(null);
    try {
      const r = await fetch("/api/telas/comando", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dispositivo: id, comando, ...corpoExtra }),
      });
      const corpo = (await r.json().catch(() => ({}))) as {
        error?: string;
        ok?: boolean;
        resultado?: { msg?: string; erro?: string };
      };
      if (!r.ok) throw new Error(corpo.error ?? "O comando não chegou à tela.");
      // A tela pode responder e recusar: `volume` num navegador é isso. Recusa
      // com motivo é resposta, não falha — e o motivo é o que interessa.
      if (corpo.ok === false) {
        setAviso({ tipo: "erro", texto: corpo.resultado?.erro ?? "a tela recusou o comando" });
      } else {
        setAviso({ tipo: "ok", texto: corpo.resultado?.msg ?? "a tela confirmou" });
      }
      router.refresh();
      return true;
    } catch (e) {
      setAviso({ tipo: "erro", texto: e instanceof Error ? e.message : "O comando não chegou à tela." });
      return false;
    } finally {
      setOcupado("");
    }
  }

  async function revogar() {
    setOcupado("revogar");
    try {
      const r = await fetch("/api/telas/revogar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dispositivo: id }),
      });
      const corpo = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(corpo.error ?? "Não consegui revogar.");
      setConfirmando(false);
      setAviso({ tipo: "ok", texto: "token apagado — a tela volta ao código de pareamento" });
      router.refresh();
    } catch (e) {
      setAviso({ tipo: "erro", texto: e instanceof Error ? e.message : "Não consegui revogar." });
    } finally {
      setOcupado("");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="row-action" onClick={() => comandar("recarregar")} disabled={!online || !!ocupado}>
          {ocupado === "recarregar" ? "Recarregando…" : "Recarregar"}
        </button>
        <button type="button" className="row-action" onClick={() => setFolhaAviso(true)} disabled={!online || !!ocupado}>
          Avisar
        </button>
        <button type="button" className="row-action" onClick={() => setConfirmando(true)} disabled={!!ocupado}>
          Revogar
        </button>
      </div>

      {/* Revogar funciona com a tela fora do ar — é assim que se recupera uma
          tela que ninguém alcança. Os outros dois precisam de alguém do outro
          lado para responder dentro dos 60 s do protocolo. */}
      {!online ? <p className="field-help">Sem pulso: só revogar funciona enquanto a tela não voltar.</p> : null}

      {aviso ? (
        <p className={`inline-feedback ${aviso.tipo === "ok" ? "feedback-success" : "feedback-error"}`} role="status">
          {aviso.texto}
        </p>
      ) : null}

      {folhaAviso && (
        <Sheet
          titulo={`Avisar quem está em frente à ${nome}`}
          aoFechar={() => setFolhaAviso(false)}
          rodape={
            <>
              <button
                type="button"
                className="primary-button"
                disabled={!!ocupado || !texto.trim()}
                onClick={async () => {
                  const foi = await comandar("mensagem", { texto: texto.trim() });
                  if (foi) {
                    setFolhaAviso(false);
                    setTexto("");
                  }
                }}
              >
                {ocupado === "mensagem" ? "Enviando…" : "Mostrar na tela"}
              </button>
              <button type="button" className="secondary-button" onClick={() => setFolhaAviso(false)} disabled={!!ocupado}>
                Cancelar
              </button>
            </>
          }
        >
          <div className="form-stack">
            <label className="field">
              <span>Aviso</span>
              <textarea value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={140} rows={3} autoFocus />
            </label>
            <p className="field-help">
              Aparece por cima do que a tela mostra e sai sozinho. Até 140 caracteres — é um recado para quem está
              na frente da tela, não um cartaz.
            </p>
          </div>
        </Sheet>
      )}

      {confirmando && (
        <Confirmacao
          titulo="Revogar esta tela?"
          alvo={nome}
          descricao="O token é apagado, a conexão cai e a tela volta a mostrar o código de 6 letras. Vincular de novo cria outro dispositivo, com outro histórico."
          reversivel={false}
          rotuloConfirmar="Revogar"
          confirmando={ocupado === "revogar"}
          aoConfirmar={revogar}
          aoCancelar={() => setConfirmando(false)}
        />
      )}
    </div>
  );
}
