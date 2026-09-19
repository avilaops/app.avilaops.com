"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BOTAO } from "@/components/hub-social/comum";
import { hrefConsulta, hrefRegistrar } from "@/components/dominios/dados";
import { cn } from "@/lib/utils";

/**
 * As duas ações do topo, mais a atualização da carteira.
 *
 * "Registrar domínio" só é botão quando a operação existe de verdade. Sem
 * habilitação ele continua visível, porque some-lo esconderia que a função
 * existe, mas leva ao assistente que termina dizendo o que falta — nunca a um
 * clique que finge ter registrado.
 */
export default function AcoesDominios({ podeRegistrar }: { podeRegistrar: boolean }) {
  const router = useRouter();
  const [atualizando, setAtualizando] = useState(false);
  const [resumo, setResumo] = useState("");
  const [erro, setErro] = useState("");

  async function atualizar() {
    setAtualizando(true);
    setErro("");
    setResumo("");

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
      setResumo(`${partes.join(" · ")}.`);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível atualizar.");
    } finally {
      setAtualizando(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-2 min-[560px]:w-auto min-[560px]:flex-row">
      <Link href={hrefConsulta} className={cn("secondary-button", BOTAO)}>
        Consultar domínio
      </Link>
      <Link
        href={hrefRegistrar}
        className={cn("primary-button", BOTAO)}
        aria-describedby={podeRegistrar ? undefined : "registro-indisponivel"}
      >
        Registrar domínio
      </Link>
      <button type="button" onClick={atualizar} disabled={atualizando} className={cn("secondary-button", BOTAO)}>
        {atualizando ? "Atualizando…" : "Atualizar carteira"}
      </button>

      {podeRegistrar ? null : (
        <span id="registro-indisponivel" className="sr-only">
          O registro ainda não está habilitado nesta conta; o assistente vai até a revisão.
        </span>
      )}

      {resumo ? (
        <span role="status" className="sr-only">
          {resumo}
        </span>
      ) : null}
      {erro ? (
        <span role="alert" className="text-[13px] text-[color:var(--red)]">
          {erro}
        </span>
      ) : null}
    </div>
  );
}
