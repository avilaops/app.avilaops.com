"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Edição do que o projeto é: descrição e link.
 *
 * Fica fechada por padrão e abre no botão. O painel existe para ler; se o
 * formulário estivesse sempre aberto, a leitura viraria um campo de texto e o
 * que importa (o combinado com o cliente) ficaria com cara de rascunho.
 *
 * Manda só os dois campos. A rota altera apenas o que recebe, então salvar a
 * descrição daqui não encosta no prazo nem no responsável que outra pessoa
 * tenha acabado de mudar.
 */

export default function ProjectEditForm({
  projectId,
  descricaoInicial,
  urlInicial,
}: {
  projectId: string;
  descricaoInicial: string;
  urlInicial: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = new FormData(evento.currentTarget);

    setSalvando(true);
    setErro("");

    try {
      const resposta = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          description: formulario.get("description"),
          url: formulario.get("url"),
        }),
      });

      if (!resposta.ok) {
        const dados = (await resposta.json().catch(() => null)) as { error?: string } | null;
        throw new Error(dados?.error ?? "Não foi possível salvar.");
      }

      setAberto(false);
      router.refresh();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) {
    return (
      <button type="button" className="secondary-button" onClick={() => setAberto(true)}>
        {descricaoInicial || urlInicial ? "Editar" : "Descrever o projeto"}
      </button>
    );
  }

  return (
    <form className="organization-form projeto-edicao" onSubmit={salvar}>
      <div className="operations-form-grid">
        <label className="campo-largo">
          Descrição
          <textarea
            name="description"
            rows={5}
            maxLength={4000}
            defaultValue={descricaoInicial}
            placeholder="O que é o projeto, o escopo combinado, o que precisa estar pronto."
          />
        </label>
        <label className="campo-largo">
          URL do projeto
          <input
            name="url"
            type="url"
            maxLength={500}
            defaultValue={urlInicial}
            placeholder="https://… site publicado, board, repositório, pasta"
          />
        </label>
      </div>

      <div className="organization-form-actions">
        <p>Campo vazio apaga o que estava lá.</p>
        <div className="flex gap-2">
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setAberto(false);
              setErro("");
            }}
          >
            Cancelar
          </button>
          <button className="primary-button" type="submit" disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>

      {erro ? <p className="inline-feedback feedback-error">{erro}</p> : null}
    </form>
  );
}
