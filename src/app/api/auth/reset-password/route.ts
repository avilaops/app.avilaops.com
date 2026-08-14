import { NextResponse } from "next/server";
import { resetPasswordWithToken } from "@/lib/auth";

export async function POST(request: Request) {
  let body: { token?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!token || password.length < 8 || password.length > 200) {
    return NextResponse.json(
      { error: "Informe um token válido e uma senha com pelo menos 8 caracteres." },
      { status: 400 },
    );
  }

  const ok = await resetPasswordWithToken(token, password);
  if (!ok) {
    return NextResponse.json(
      { error: "Link inválido ou expirado. Solicite uma nova redefinição." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
