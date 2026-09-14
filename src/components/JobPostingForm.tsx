"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { CONTRACTS, LOCATION_TYPES } from "@/lib/job-postings.constants";

/**
 * Abertura de vaga. Pede só o cabeçalho — o corpo editorial, que é o trabalho
 * de verdade, entra no editor logo depois. A vaga nasce em rascunho e não toca
 * o site até alguém publicá-la.
 */
export default function JobPostingForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/job-postings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: form.get("title"),
          area: form.get("area"),
          team: form.get("team"),
          location: form.get("location"),
          locationType: form.get("locationType"),
          contract: form.get("contract"),
          summary: form.get("summary"),
          postedAt: form.get("postedAt"),
          validThrough: form.get("validThrough"),
        }),
      });
      const result = (await response.json()) as {
        posting?: { id: string };
        error?: string;
      };
      if (!response.ok || !result.posting) {
        throw new Error(result.error ?? "Não foi possível criar a vaga.");
      }

      router.push(`/vagas/${result.posting.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível criar a vaga.");
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
        }}
        aria-expanded={open}
      >
        {open ? "Fechar cadastro" : "Nova vaga"}
        <span aria-hidden="true">{open ? "×" : "+"}</span>
      </button>

      {open ? (
        <form className="organization-form" onSubmit={submit}>
          <div className="form-title">
            <div>
              <h2>Abertura em rascunho</h2>
            </div>
            <span className="status-chip">Não vai ao ar agora</span>
          </div>

          <div className="operations-form-grid">
            <label>
              Título da vaga *
              <input
                name="title"
                required
                minLength={3}
                maxLength={160}
                placeholder="Ex.: Pessoa Desenvolvedora Full Stack"
              />
            </label>
            <label>
              Área
              <input name="area" maxLength={80} placeholder="Ex.: Tecnologia" />
            </label>
            <label>
              Time
              <input name="team" maxLength={80} placeholder="Ex.: Plataforma" />
            </label>
            <label>
              Local
              <input name="location" maxLength={160} placeholder="Ex.: Belo Horizonte, MG" />
            </label>
            <label>
              Modelo
              <select name="locationType" defaultValue="Remoto">
                {LOCATION_TYPES.map((item) => (
                  <option value={item} key={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Contrato
              <select name="contract" defaultValue="Tempo integral">
                {CONTRACTS.map((item) => (
                  <option value={item} key={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Publicação
              <input name="postedAt" type="date" />
            </label>
            <label>
              Inscrição até
              <input name="validThrough" type="date" />
            </label>
            <label className="span-two">
              Resumo
              <input
                name="summary"
                maxLength={400}
                placeholder="Uma frase que explique a vaga na listagem"
              />
            </label>
          </div>

          <div className="organization-form-actions">
            <p>
              O corpo da vaga - introdução, responsabilidades, expertise e benefícios -
              é preenchido no editor, que abre em seguida.
            </p>
            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? "Criando…" : "Criar rascunho"}
            </button>
          </div>

          {error ? <p className="inline-feedback feedback-error">{error}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
