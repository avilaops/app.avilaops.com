import { NextResponse } from "next/server";
import { requestPasswordReset } from "@/lib/auth";
import { enviarEmail } from "@/lib/email";

function genericResponse() {
  return NextResponse.json({
    ok: true,
    message: "Se o e-mail existir, enviamos um link de redefinição.",
  });
}

export async function POST(request: Request) {
  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) {
    return NextResponse.json({ error: "Informe um e-mail." }, { status: 400 });
  }

  try {
    const rawToken = await requestPasswordReset(email);
    if (rawToken) {
      const baseUrl = process.env.APP_BASE_URL ?? "https://app.avilaops.com";
      const resetUrl = `${baseUrl}/redefinir-senha?token=${rawToken}`;
      await enviarEmail({
        to: email,
        subject: "Redefinição de senha no Ávila OS",
        html: `
          <p>Recebemos um pedido para redefinir a senha da sua conta no Ávila OS.</p>
          <p><a href="${resetUrl}">Clique aqui para criar uma nova senha</a>. O link expira em 1 hora.</p>
          <p>Se você não pediu essa redefinição, ignore este e-mail.</p>
        `,
      });
    }
  } catch (error) {
    console.error("forgot-password failed", error);
  }

  // Resposta sempre genérica, para não permitir enumeração de e-mails.
  return genericResponse();
}
