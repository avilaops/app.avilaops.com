"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function TaskQuickAdd({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    setLoading(true);
    setError("");
    const form = new FormData(formEl);

    try {
      const response = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: form.get("title"),
          ownerName: form.get("ownerName"),
          priority: form.get("priority"),
          dueAt: form.get("dueAt"),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "Não foi possível criar a tarefa.");
      }

      formEl.isConnected && formEl.reset();
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Não foi possível criar a tarefa.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="task-quick-add" onSubmit={submit}>
      <input
        name="title"
        required
        minLength={3}
        maxLength={160}
        placeholder="Nova tarefa"
      />
      <input name="ownerName" maxLength={100} placeholder="Responsável" />
      <select name="priority" defaultValue="MEDIUM">
        <option value="LOW">Baixa</option>
        <option value="MEDIUM">Média</option>
        <option value="HIGH">Alta</option>
        <option value="URGENT">Urgente</option>
      </select>
      <input name="dueAt" type="date" />
      <button className="small-primary" type="submit" disabled={loading}>
        {loading ? "Adicionando…" : "Adicionar"}
      </button>
      {error ? <p className="inline-feedback feedback-error">{error}</p> : null}
    </form>
  );
}
