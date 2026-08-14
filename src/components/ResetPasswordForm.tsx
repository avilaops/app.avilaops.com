"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível redefinir a senha.");
      setDone(true);
      setTimeout(() => router.replace("/login"), 2000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível redefinir a senha.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return <p className="login-footnote">Senha redefinida. Redirecionando para o login…</p>;
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label>
        Nova senha
        <input name="password" type="password" required minLength={8} autoComplete="new-password" />
      </label>
      <label>
        Confirmar nova senha
        <input name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <button type="submit" className="primary-button login-button" disabled={loading}>
        {loading ? "Salvando…" : "Redefinir senha"}
      </button>
    </form>
  );
}
