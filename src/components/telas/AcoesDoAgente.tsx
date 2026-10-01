"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Confirmacao from "@/components/sistema/Confirmacao";

/**
 * O que dá para fazer com um agente daqui.
 *
 * Menos do que com uma tela, e de propósito. Recarregar e avisar são comandos
 * de tela: num agente voltariam `comando_desconhecido`, e oferecer um botão
 * que sempre falha é pior que não oferecer.
 *
 * O que faz sentido é **olhar a LAN**: pedir o inventário com a saúde de cada
 * aparelho. Ele não vem no pulso porque custa um socket em cada aparelho do
 * lado de lá — vem quando alguém pergunta, que é agora.
 *
 * Mandar ação num aparelho da LAN não está aqui. A tela de Telas responde
 * "qual tela precisa de mim agora?"; comandar impressora e tomada é operação
 * de outro assunto, e vai nascer onde esse assunto morar.
 */
type Aparelho = {
  id: string;
  nome: string;
  tipo: string;
  recursos: string[];
  padrao: boolean;
  saude: { estado: string; detalhe?: string; latenciaMs: number | null } | null;
  erro?: string;
};

const TOM: Record<string, string> = {
  ligado: "text-[color:var(--green)]",
  standby: "text-[color:var(--blue)]",
  travado: "text-[color:var(--amber)]",
  offline: "text-[color:var(--red)]",
};

export default function AcoesDoAgente({
  id,
  nome,
  podeRevogar = false,
}: {
  id: string;
  nome: string;
  /** Revogar é irreversível e só o dono pode; para o sócio o botão não existe. */
  podeRevogar?: boolean;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState("");
  const [erro, setErro] = useState("");
  const [lan, setLan] = useState<Aparelho[] | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  async function olharLan() {
    setOcupado("lan");
    setErro("");
    try {
      const r = await fetch("/api/telas/comando", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dispositivo: id, comando: "dispositivos" }),
      });
      const corpo = (await r.json().catch(() => ({}))) as {
        error?: string;
        resultado?: { dispositivos?: Aparelho[] };
      };
      if (!r.ok) throw new Error(corpo.error ?? "O agente não respondeu.");
      setLan(corpo.resultado?.dispositivos ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "O agente não respondeu.");
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
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui revogar.");
    } finally {
      setOcupado("");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="row-action" onClick={olharLan} disabled={!!ocupado}>
          {ocupado === "lan" ? "Perguntando…" : "Olhar a LAN"}
        </button>
        {podeRevogar ? (
          <button type="button" className="row-action" onClick={() => setConfirmando(true)} disabled={!!ocupado}>
            Revogar
          </button>
        ) : null}
      </div>

      {erro ? (
        <p className="inline-feedback feedback-error" role="alert">
          {erro}
        </p>
      ) : null}

      {lan ? (
        lan.length ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {lan.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 text-[13px] leading-snug">
                <strong>{a.nome}</strong>
                <span className="text-muted-foreground">{a.tipo}</span>
                {/* Aparelho que não respondeu aparece com o motivo, e não some:
                    sumir faria parecer que ele não existe na instalação. */}
                <span className={a.saude ? (TOM[a.saude.estado] ?? "text-muted-foreground") : "text-[color:var(--red)]"}>
                  {a.saude ? a.saude.estado : (a.erro ?? "não respondeu")}
                  {a.saude?.detalhe ? ` · ${a.saude.detalhe}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="field-help">Este agente não declarou nenhum aparelho: está instalado onde ainda não há nada na LAN.</p>
        )
      ) : null}

      {confirmando && (
        <Confirmacao
          titulo="Revogar este agente?"
          alvo={nome}
          descricao="O token é apagado e a conexão cai. Os aparelhos da LAN continuam funcionando. O que se perde é o caminho até eles, e ele só volta com alguém aprovando um código novo no lugar."
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
