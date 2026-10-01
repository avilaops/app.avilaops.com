"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { nomeProprio } from "@/lib/format";

type OrganizationOption = {
  id: string;
  name: string;
  brands: { id: string; name: string }[];
};

const priorities = [
  { value: "LOW", label: "Baixa" },
  { value: "MEDIUM", label: "Média" },
  { value: "HIGH", label: "Alta" },
  { value: "URGENT", label: "Urgente" },
];

export default function ProjectForm({
  organizations,
}: {
  organizations: OrganizationOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);

  const brands = useMemo(
    () => organizations.find((item) => item.id === organizationId)?.brands ?? [],
    [organizations, organizationId],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    setLoading(true);
    setMessage("");
    setError("");
    const form = new FormData(formEl);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId: form.get("organizationId"),
          brandId: form.get("brandId"),
          title: form.get("title"),
          description: form.get("description"),
          url: form.get("url"),
          priority: form.get("priority"),
          ownerName: form.get("ownerName"),
          dueAt: form.get("dueAt"),
        }),
      });
      const result = (await response.json()) as {
        project?: { id: string; title: string };
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error ?? "Não foi possível criar o projeto.");
      }

      // O upload vem depois da criação porque o arquivo precisa do id do
      // projeto para saber onde morar. Se falhar, o projeto continua criado: a
      // mensagem avisa o que faltou em vez de fingir que deu tudo certo.
      let avisoDeArquivo = "";
      if (result.project?.id && arquivos.length > 0) {
        const pacote = new FormData();
        for (const arquivo of arquivos) pacote.append("file", arquivo);

        const envio = await fetch(`/api/projects/${result.project.id}/arquivos`, {
          method: "POST",
          body: pacote,
        });
        if (!envio.ok) {
          const falha = (await envio.json().catch(() => null)) as { error?: string } | null;
          avisoDeArquivo = ` Os arquivos não subiram: ${falha?.error ?? "falha no envio"}`;
        }
      }

      setMessage(`${result.project?.title ?? "Projeto"} criado.${avisoDeArquivo}`);
      formEl.isConnected && formEl.reset();
      setArquivos([]);
      setOrganizationId("");
      router.refresh();
      window.setTimeout(() => {
        setOpen(false);
        setMessage("");
      }, 1600);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Não foi possível criar o projeto.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="organization-form-wrap">
      <button
        className="primary-button"
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          setError("");
          setMessage("");
        }}
        aria-expanded={open}
        disabled={organizations.length === 0}
        title={
          organizations.length === 0
            ? "Cadastre um cliente antes de abrir um projeto."
            : undefined
        }
      >
        {open ? "Fechar cadastro" : "Novo projeto"}
        <span aria-hidden="true">{open ? "×" : "+"}</span>
      </button>

      {open ? (
        <form className="organization-form" onSubmit={submit}>
          <div className="form-title">
            <div>
              <h2>Abertura de projeto</h2>
            </div>
            <span className="status-chip">Dados mínimos</span>
          </div>

          <div className="operations-form-grid">
            <label>
              Cliente *
              <select
                name="organizationId"
                required
                value={organizationId}
                onChange={(event) => setOrganizationId(event.target.value)}
              >
                <option value="" disabled>
                  Selecione o cliente
                </option>
                {organizations.map((organization) => (
                  <option value={organization.id} key={organization.id}>
                    {nomeProprio(organization.name)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Marca
              <select name="brandId" defaultValue="" disabled={brands.length === 0}>
                <option value="">Marca principal</option>
                {brands.map((brand) => (
                  <option value={brand.id} key={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Título do projeto *
              <input
                name="title"
                required
                minLength={3}
                maxLength={160}
                placeholder="Ex.: Site institucional - fase 1"
              />
            </label>
            <label>
              Responsável
              <input name="ownerName" maxLength={100} placeholder="Opcional" />
            </label>
            <label>
              Prioridade
              <select name="priority" defaultValue="MEDIUM">
                {priorities.map((priority) => (
                  <option value={priority.value} key={priority.value}>
                    {priority.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Prazo
              <input name="dueAt" type="date" />
            </label>
            <label className="campo-largo">
              Descrição
              <textarea
                name="description"
                rows={4}
                maxLength={4000}
                placeholder="O que é o projeto, o escopo combinado, o que precisa estar pronto."
              />
            </label>
            <label className="campo-largo">
              URL do projeto
              <input
                name="url"
                type="url"
                maxLength={500}
                placeholder="https://… site publicado, board, repositório, pasta"
              />
            </label>
            <label className="campo-largo">
              Mídia do projeto
              <input
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf,video/mp4,video/webm"
                onChange={(event) => setArquivos(Array.from(event.target.files ?? []))}
              />
              <small>
                Imagem, PDF, MP4 ou WebM. Até 10 arquivos, 25 MB cada.
                {arquivos.length > 0
                  ? ` Selecionados: ${arquivos.map((a) => a.name).join(", ")}`
                  : ""}
              </small>
            </label>
          </div>

          <div className="organization-form-actions">
            <p>
              Checklists, evidências e aceite entram em uma etapa dedicada de
              execução, após a abertura do projeto.
            </p>
            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? "Salvando…" : "Criar projeto"}
            </button>
          </div>

          {error ? <p className="inline-feedback feedback-error">{error}</p> : null}
          {message ? (
            <p className="inline-feedback feedback-success">{message}</p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
