"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shadcn/button";
import { Textarea } from "@/components/shadcn/textarea";

type Props = {
  organizationId: string;
  tipo: "tabela" | "coluna";
  alvoId: string;
  nomeDoAlvo: string;
  inicial: string | null;
};

/** Anotação editável no lugar: texto até alguém tocar, campo enquanto edita. */
export default function AnotacaoBanco({ organizationId, tipo, alvoId, nomeDoAlvo, inicial }: Props) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [gravado, setGravado] = useState(inicial ?? "");
  const [valor, setValor] = useState(inicial ?? "");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setOcupado(true);
    setErro(null);
    try {
      const resposta = await fetch(`/api/organizations/${organizationId}/bancos/anotacoes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, alvoId, description: valor }),
      });
      const corpo = (await resposta.json().catch(() => null)) as { error?: string; description?: string | null } | null;
      if (!resposta.ok) throw new Error(corpo?.error ?? "Não foi possível salvar a anotação.");
      setGravado(corpo?.description ?? "");
      setValor(corpo?.description ?? "");
      setEditando(false);
      router.refresh();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível salvar a anotação.");
    } finally {
      setOcupado(false);
    }
  }

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        aria-label={`${gravado ? "Editar" : "Escrever"} anotação de ${nomeDoAlvo}`}
        className="min-h-11 w-full min-w-[160px] rounded-md px-1 text-left text-sm leading-5 whitespace-pre-wrap hover:bg-muted min-[821px]:min-h-8"
      >
        {gravado || <span className="text-muted-foreground">Anotar…</span>}
      </button>
    );
  }

  return (
    <div className="flex min-w-[220px] flex-col gap-2">
      <Textarea
        autoFocus
        value={valor}
        onChange={(evento) => setValor(evento.target.value)}
        maxLength={2000}
        rows={3}
        aria-label={`Anotação de ${nomeDoAlvo}`}
        placeholder="O que este dado significa, de onde vem, quem usa"
      />
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={salvar} disabled={ocupado}>
          {ocupado ? "Salvando…" : "Salvar"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={ocupado}
          onClick={() => {
            setValor(gravado);
            setErro(null);
            setEditando(false);
          }}
        >
          Cancelar
        </Button>
      </div>
      {erro ? <p role="alert" className="text-sm text-[color:var(--red)]">{erro}</p> : null}
    </div>
  );
}
