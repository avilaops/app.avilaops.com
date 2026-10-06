import { NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { listarCredenciais, salvarCredencial } from "@/lib/credenciais";
import { origemEstrita } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Cofre de credenciais da plataforma. Segredo é do dono: nem o sócio entra.
 * A lista nunca devolve valor de chave marcada como segredo — só a máscara.
 */
export async function GET() {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!ehDono(admin.role)) {
    return NextResponse.json({ error: "Só o dono da conta pode isto." }, { status: 403 });
  }

  const credenciais = await listarCredenciais();
  return NextResponse.json({ credenciais });
}

export async function POST(request: Request) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!ehDono(admin.role)) {
    return NextResponse.json({ error: "Só o dono da conta pode isto." }, { status: 403 });
  }
  if (!origemEstrita(request)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  const corpo = (await request.json().catch(() => null)) as {
    chave?: unknown;
    valor?: unknown;
    rotulo?: unknown;
    descricao?: unknown;
  } | null;

  if (!corpo || typeof corpo.chave !== "string" || !corpo.chave.trim()) {
    return NextResponse.json({ error: "Informe a chave." }, { status: 400 });
  }

  try {
    const linha = await salvarCredencial(
      {
        chave: corpo.chave,
        valor: typeof corpo.valor === "string" ? corpo.valor : null,
        rotulo: typeof corpo.rotulo === "string" ? corpo.rotulo : null,
        descricao: typeof corpo.descricao === "string" ? corpo.descricao : null,
      },
      admin.id,
    );

    await prisma.operationsAuditEvent.create({
      data: {
        actorId: admin.id,
        action: "PLATFORM_CREDENTIAL_SET",
        entityType: "PlatformCredential",
        entityId: linha.chave,
        // Nunca o valor. O evento registra que mudou, não o que virou.
        metadata: { categoria: linha.categoria, status: linha.status },
      },
    });

    return NextResponse.json({ chave: linha.chave, status: linha.status });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Falha ao salvar credencial.";
    return NextResponse.json({ error: mensagem }, { status: 400 });
  }
}
