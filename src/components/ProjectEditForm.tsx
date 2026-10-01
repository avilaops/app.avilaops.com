"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Edição do que a abertura do projeto registrou.
 *
 * Existe porque até aqui título, descrição, link, responsável, prioridade e
 * prazo só entravam na criação: errar o escopo ou colar o link errado
 * significava conviver com o erro. A mídia já ia e vinha; o texto ao lado dela,
 * não.
 *
 * Fechado por padrão, como a abertura de projeto: a tela do projeto é para
 * olhar o andamento, não para editar cadastro. Quem vem corrigir abre.
 */

const prioridades = [
  { value: "LOW", label: "Baixa" },
  { value: "MEDIUM", label: "Média" },
  { value: "HIGH", label: "Alta" },
  { value: "URGENT", label: "Urgente" },
];

export type ProjetoEditavel = {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  priority: string;
  ownerName: string | null;
  /** ISO, ou nulo. O input `date` quer só a parte da data. */
  dueAt: string | null;
};

function paraCampoData(iso: string | null) {
  if (!iso) return "";
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? "" : data.toISOString().slice(0, 10);
}

export default function ProjectEditForm({ projeto }: { projeto: ProjetoEditavel }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = new FormData(evento.currentTarget);
    setSalvando(true);
    setMensagem("");
    setErro("");

    try {
      const resposta = await fetch(`/api/projects/${projeto.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        // Todos os campos do formulário, sempre: a rota distingue ausente de
        // vazio, e é o vazio que permite apagar uma descrição.
        body: JSON.stringify({
          title: form.get("title"),
          description: form.get("description"),
          url: form.get("url"),
          priority: form.get("priority"),
          ownerName: form.get("ownerName"),
          dueAt: form.get("dueAt"),
        }),
      });
      const resultado = (await resposta.json()) as {
        ok?: boolean;
        error?: string;
        semAlteracao?: boolean;
      };
      if (!resposta.ok || !resultado.ok) {
        throw new Error(resultado.error ?? "Não foi possível salvar o projeto.");
      }

      // Abrir, reler e fechar sem mexer em nada é uso normal. Dizer "atualizado"
      // nesse caso seria a tela afirmando uma mudança que não houve.
      setMensagem(resultado.semAlteracao ? "Nada mudou." : "Projeto atualizado.");
      setAberto(false);
      router.refresh();
    } catch (capturado) {
      setErro(
        capturado instanceof Error ? capturado.message : "Não foi possível salvar o projeto.",
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <button
        className="secondary-button"
        type="button"
        onClick={() => {
          setAberto((atual) => !atual);
          setErro("");
          setMensagem("");
        }}
        aria-expanded={aberto}
      >
        {aberto ? "Cancelar edição" : "Editar projeto"}
      </button>

      {mensagem && !aberto ? (
        <p className="inline-feedback feedback-success">{mensagem}</p>
      ) : null}

      {aberto ? (
        <form className="organization-form form-no-fluxo" onSubmit={salvar}>
          <div className="form-title">
            <div>
              <h2>Editar projeto</h2>
            </div>
            <span className="status-chip">Cadastro</span>
          </div>

          <div className="operations-form-grid">
            <label>
              Título do projeto *
              <input
                name="title"
                required
                minLength={3}
                maxLength={160}
                defaultValue={projeto.title}
              />
            </label>
            <label>
              Responsável
              <input
                name="ownerName"
                maxLength={100}
                placeholder="Opcional"
                defaultValue={projeto.ownerName ?? ""}
              />
            </label>
            <label>
              Prioridade
              <select name="priority" defaultValue={projeto.priority}>
                {prioridades.map((prioridade) => (
                  <option value={prioridade.value} key={prioridade.value}>
                    {prioridade.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Prazo
              <input name="dueAt" type="date" defaultValue={paraCampoData(projeto.dueAt)} />
            </label>
            <label className="campo-largo">
              Descrição
              <textarea
                name="description"
                rows={4}
                maxLength={4000}
                placeholder="O que é o projeto, o escopo combinado, o que precisa estar pronto."
                defaultValue={projeto.description ?? ""}
              />
            </label>
            <label className="campo-largo">
              URL do projeto
              <input
                name="url"
                type="url"
                maxLength={500}
                placeholder="https://… site publicado, board, repositório, pasta"
                defaultValue={projeto.url ?? ""}
              />
            </label>
          </div>

          <div className="organization-form-actions">
            <p>Campo deixado em branco apaga o valor que estava lá.</p>
            <button className="primary-button" type="submit" disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar alterações"}
            </button>
          </div>

          {erro ? <p className="inline-feedback feedback-error">{erro}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
