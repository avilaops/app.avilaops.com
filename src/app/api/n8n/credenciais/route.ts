import { NextRequest, NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { N8nApiIndisponivel, listarSituacao, n8nApiConfigurada, salvarCredencial } from "@/lib/n8n-credenciais";

export const runtime = "nodejs";

// Credencial do n8n é segredo de terceiro (Cloudflare, Mercado Pago, chaves
// de API): só o dono, como tudo que fica atrás de `ehDono`.
async function guarda() {
  const admin = await getAdmin();
  if (!admin) return { erro: NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 }) };
  if (!ehDono(admin.role)) return { erro: NextResponse.json({ error: "Só o dono da conta pode isto." }, { status: 403 }) };
  return { admin };
}

export async function GET() {
  const g = await guarda();
  if ("erro" in g) return g.erro;
  if (!n8nApiConfigurada()) return NextResponse.json({ error: "N8N_API_KEY não configurada no servidor." }, { status: 503 });
  try {
    return NextResponse.json({ credenciais: await listarSituacao() });
  } catch (erro) {
    const mensagem = erro instanceof N8nApiIndisponivel ? erro.message : "Não consegui falar com o n8n.";
    return NextResponse.json({ error: mensagem }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const g = await guarda();
  if ("erro" in g) return g.erro;
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });

  let corpo: { id?: unknown; nome?: unknown; tipo?: unknown; dados?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const id = typeof corpo.id === "string" ? corpo.id.trim() : "";
  const nome = typeof corpo.nome === "string" ? corpo.nome.trim() : "";
  const tipo = typeof corpo.tipo === "string" ? corpo.tipo.trim() : "";
  const dados = corpo.dados && typeof corpo.dados === "object" ? (corpo.dados as Record<string, string>) : {};
  if (!id || !nome || !tipo) return NextResponse.json({ error: "Faltou id, nome ou tipo." }, { status: 400 });

  try {
    const resultado = await salvarCredencial({ id, nome, tipo, dados });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Não consegui salvar.";
    const status = erro instanceof N8nApiIndisponivel ? 502 : 400;
    return NextResponse.json({ error: mensagem }, { status });
  }
}
