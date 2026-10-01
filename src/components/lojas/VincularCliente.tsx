"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import type { ClienteCandidato, Sugestao } from "@/lib/lojas-painel";
import { nomeProprio } from "@/lib/format";

/**
 * "De quem é esta loja?" — a pergunta que a área encontra e não respondia.
 *
 * O palpite vem pronto e **com o motivo à vista**: quem confirma precisa saber
 * por que aquele nome foi oferecido, senão está confirmando um oráculo. Nada é
 * gravado até o toque em "Vincular", e a lista completa fica junto para o
 * palpite errado custar um toque, não uma correção depois.
 */
export default function VincularCliente({
  slug,
  nomeDaLoja,
  sugestao,
  clientes,
}: {
  slug: string;
  nomeDaLoja: string;
  sugestao: Sugestao | null;
  clientes: ClienteCandidato[];
}) {
  const router = useRouter();
  const [aberta, setAberta] = useState(false);
  const [escolhido, setEscolhido] = useState(sugestao?.cliente.id ?? "");
  const [busca, setBusca] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const lista = q ? clientes.filter((c) => c.nome.toLowerCase().includes(q)) : clientes;
    return lista.slice(0, 40);
  }, [busca, clientes]);

  async function vincular() {
    if (!escolhido) return;
    setEnviando(true);
    setErro("");
    try {
      const r = await fetch(`/api/lojas/${encodeURIComponent(slug)}/vincular`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId: escolhido }),
      });
      const corpo = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(corpo.error ?? "Não consegui vincular.");
      setAberta(false);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui vincular.");
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
          titulo={`De quem é a ${nomeDaLoja}?`}
          aoFechar={() => setAberta(false)}
          rodape={
            <button type="button" className="primary-button" onClick={vincular} disabled={!escolhido || enviando}>
              {enviando ? "Vinculando…" : "Vincular"}
            </button>
          }
        >
          {sugestao ? (
            <p className="field-help">
              Palpite: <strong>{nomeProprio(sugestao.cliente.nome)}</strong>. {sugestao.motivo}.
              {sugestao.forca === "fraco" ? " É um casamento fraco — confira antes." : ""}
            </p>
          ) : (
            <p className="field-help">
              Nenhum cliente parece com esta loja. Escolha na lista — em branco é melhor que um palpite ruim.
            </p>
          )}

          <label className="campo-busca">
            <span className="sr-only">Buscar cliente</span>
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente pelo nome"
            />
          </label>

          <div className="grupo-superficie" role="radiogroup" aria-label="Clientes">
            {filtrados.map((cliente) => (
              <label key={cliente.id} className={escolhido === cliente.id ? "linha linha-ativa" : "linha"}>
                <span className="linha-texto">
                  <strong>{nomeProprio(cliente.nome)}</strong>
                  {sugestao?.cliente.id === cliente.id ? <small>sugerido</small> : null}
                </span>
                <input
                  type="radio"
                  name="cliente"
                  value={cliente.id}
                  checked={escolhido === cliente.id}
                  onChange={() => setEscolhido(cliente.id)}
                />
              </label>
            ))}
            {filtrados.length === 0 ? (
              <p className="linha linha-estatica">
                <span className="linha-texto">Nenhum cliente com esse nome.</span>
              </p>
            ) : null}
          </div>

          {erro ? (
            <p className="field-help" role="alert" style={{ color: "var(--red)" }}>
              {erro}
            </p>
          ) : null}
        </Sheet>
      )}
    </>
  );
}
