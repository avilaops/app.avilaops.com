"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          login: form.get("login"),
          password: form.get("password"),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Acesso não autorizado");
      router.replace("/operacao");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Não foi possível entrar.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      className="login-form"
      method="post"
      action="/api/auth/login"
      onSubmit={submit}
    >
      <label>
        E-mail ou CPF
        <input name="login" required autoComplete="username" />
      </label>
      <label>
        Senha
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <button type="submit" className="primary-button login-button" disabled={loading}>
        {loading ? "Validando acesso…" : "Entrar no Ávila OS"}
      </button>
      <a className="login-footnote" href="/esqueci-senha">
        Esqueci minha senha
      </a>
    </form>
  );
}
