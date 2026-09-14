"use client";

import { FormEvent, useState } from "react";

export default function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.get("email") }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível processar o pedido.");
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível processar o pedido.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <p className="login-footnote">
        Se o e-mail existir na base, enviamos um link de redefinição. Verifique
        sua caixa de entrada (e o spam) - o link expira em 1 hora.
      </p>
    );
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label>
        E-mail cadastrado
        <input name="email" type="email" required autoComplete="username" />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <button type="submit" className="primary-button login-button" disabled={loading}>
        {loading ? "Enviando…" : "Enviar link de redefinição"}
      </button>
    </form>
  );
}
