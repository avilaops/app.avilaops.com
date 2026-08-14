"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
          priority: form.get("priority"),
          ownerName: form.get("ownerName"),
          dueAt: form.get("dueAt"),
        }),
      });
      const result = (await response.json()) as {
        project?: { title: string };
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error ?? "Não foi possível criar o projeto.");
      }

      setMessage(`${result.project?.title ?? "Projeto"} criado.`);
      formEl.isConnected && formEl.reset();
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
              <span className="eyebrow">Novo projeto</span>
              <h2>Abertura de entrega</h2>
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
                    {organization.name}
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
                placeholder="Ex.: Site institucional — fase 1"
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
