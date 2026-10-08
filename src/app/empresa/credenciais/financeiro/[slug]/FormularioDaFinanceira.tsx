"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Grupo } from "@/components/sistema/Lista";

export type CampoNaTela = {
  chave: string;
  rotulo: string;
  ajuda: string;
  obrigatorio: boolean;
  ondeAchar?: string;
  grupo?: string;
  preenchida: boolean;
  mascara: string | null;
  atualizadoEm: string | null;
};

/** O `id` do campo de uma chave, para outra parte da tela levar o cursor até ele. */
export function idDoCampo(chave: string) {
  return `credencial-${chave}`;
}

/**
 * Os campos de uma financeira.
 *
 * Campo já guardado nasce VAZIO, com a máscara do valor atual embaixo. É a
 * diferença entre "não sei o que está aqui" e "já tem valor, e este é o
 * final dele" — e deixa claro que digitar algo substitui, enquanto deixar em
 * branco mantém. Trazer o segredo preenchido no HTML seria entregá-lo a
 * qualquer extensão do navegador que leia o formulário.
 */
export default function FormularioDaFinanceira({
  slug,
  nome,
  campos,
}: {
  slug: string;
  nome: string;
  campos: CampoNaTela[];
}) {
  const router = useRouter();
  const [valores, setValores] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);

  const preenchidosAgora = Object.values(valores).filter((v) => v.trim()).length;

  async function salvar() {
    setSalvando(true);
    setErro(null);
    setRecado(null);

    try {
      const resposta = await fetch("/api/empresa/credenciais", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ financeira: slug, valores }),
      });
      const dados = (await resposta.json().catch(() => ({}))) as {
        erro?: string;
        guardadas?: string[];
      };
      if (!resposta.ok) throw new Error(dados.erro ?? "Não consegui guardar.");

      const quantas = dados.guardadas?.length ?? 0;
      setRecado(`${quantas} ${quantas === 1 ? "chave guardada" : "chaves guardadas"} em ${nome}.`);
      setValores({});
      router.refresh();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não consegui guardar.");
    } finally {
      setSalvando(false);
    }
  }

  // Campos vizinhos do mesmo grupo ficam sob um título só. Financeira sem
  // grupo no catálogo continua como sempre: uma fila única, sem título.
  const blocos: Array<{ titulo: string | null; campos: CampoNaTela[] }> = [];
  for (const campo of campos) {
    const titulo = campo.grupo ?? null;
    const ultimo = blocos[blocos.length - 1];
    if (ultimo && ultimo.titulo === titulo) ultimo.campos.push(campo);
    else blocos.push({ titulo, campos: [campo] });
  }

  return (
    <Grupo titulo="Chaves">
      <div className="credenciais-form">
        {blocos.map((bloco) => (
          <fieldset className="credenciais-bloco" key={bloco.titulo ?? "sem-grupo"}>
            {bloco.titulo ? <legend>{bloco.titulo}</legend> : null}
            {bloco.campos.map((campo) => (
              <label className="credencial-campo" key={campo.chave}>
                <span className="credencial-cabecalho">
                  <span>
                    {campo.rotulo}
                    {campo.obrigatorio ? <em className="credencial-obrigatoria"> · obrigatória</em> : null}
                  </span>
                  {/* O estado ao lado do nome: dá para saber o que falta sem ler campo por campo. */}
                  <em className={campo.preenchida ? "credencial-selo credencial-selo-ok" : "credencial-selo"}>
                    {campo.preenchida ? `Guardada${campo.mascara ? ` · ${campo.mascara}` : ""}` : "Vazia"}
                  </em>
                </span>
                <input
                  id={idDoCampo(campo.chave)}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={campo.preenchida ? "Digite para substituir" : "Cole o valor aqui"}
                  value={valores[campo.chave] ?? ""}
                  disabled={salvando}
                  onChange={(evento) =>
                    setValores((atual) => ({ ...atual, [campo.chave]: evento.target.value }))
                  }
                />
                <small>{campo.ajuda}</small>
                <small className="credencial-estado">
                  {campo.ondeAchar ? `Onde achar: ${campo.ondeAchar} · ` : ""}
                  <code>{campo.chave}</code>
                </small>
              </label>
            ))}
          </fieldset>
        ))}

        <div className="credenciais-acoes">
          <button
            type="button"
            className="primary-button"
            disabled={salvando || preenchidosAgora === 0}
            onClick={() => void salvar()}
          >
            {salvando ? "Guardando…" : "Guardar"}
          </button>
          <small>
            Campo em branco mantém o que já está guardado. Nada aqui vai para arquivo: o valor é
            cifrado no banco.
          </small>
        </div>

        {erro ? <p className="aviso-erro">{erro}</p> : null}
        {recado ? <p className="aviso-ok">{recado}</p> : null}
      </div>
    </Grupo>
  );
}
