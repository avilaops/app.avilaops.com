"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Relê o registro de cada domínio `.br` da carteira e grava o vencimento.
 *
 * Mora no cabeçalho da lista, não no topo da tela: é manutenção do que já
 * está ali, e no topo virava um terceiro botão do tamanho dos dois que
 * importam, empurrando a carteira para fora da primeira tela do celular.
 */
export default function BotaoAtualizar() {
  const router = useRouter();
  const [atualizando, setAtualizando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState("");

  async function atualizar() {
    setAtualizando(true);
    setErro("");
    setAviso("");

    try {
      const resposta = await fetch("/api/integrations/registro-br/sync", { method: "POST" });
      const dados = await resposta.json();

      if (!resposta.ok || !dados.ok) {
        setErro(dados.error ?? "Não foi possível atualizar.");
        return;
      }

      const r = dados.resumo;
      const partes = [`${r.consultados} consultados`, `${r.atualizados} atualizados`];
      if (r.semRegistro?.length) partes.push(`${r.semRegistro.length} sem registro`);
      setAviso(`${partes.join(" · ")}.`);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível atualizar.");
    } finally {
      setAtualizando(false);
    }
  }

  return (
    <span className="flex shrink-0 items-center gap-2">
      {aviso ? (
        <span role="status" className="hidden text-[13px] text-muted-foreground min-[821px]:inline">
          {aviso}
        </span>
      ) : null}
      {erro ? (
        <span role="alert" className="text-[13px] text-[color:var(--red)]">
          {erro}
        </span>
      ) : null}
      <button type="button" className="secondary-button" onClick={atualizar} disabled={atualizando}>
        {atualizando ? "Atualizando…" : "Atualizar"}
      </button>
    </span>
  );
}
