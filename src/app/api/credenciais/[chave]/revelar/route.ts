import { NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { pedirConfirmacao, temConfirmacaoRecente } from "@/lib/confirmacao-recente";
import { revelarCredencial } from "@/lib/credenciais";
import { origemEstrita } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Devolve o valor em claro de uma credencial.
 *
 * É POST, e não GET, de propósito: revelar segredo é um ato, fica no histórico
 * e não deve ser algo que um prefetch do navegador ou um log de acesso dispare
 * sozinho. Toda revelação vira evento de auditoria com autor e horário.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ chave: string }> },
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!ehDono(admin.role)) {
    return NextResponse.json({ error: "Só o dono da conta pode isto." }, { status: 403 });
  }
  if (!origemEstrita(request)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }
  // Sessão aberta não basta para ver segredo em claro: pede a senha de novo.
  if (!(await temConfirmacaoRecente(admin.id))) return pedirConfirmacao();

  const { chave } = await params;

  try {
    const valor = await revelarCredencial(chave);
    if (valor === null) {
      return NextResponse.json({ error: "Credencial sem valor guardado." }, { status: 404 });
    }

    await prisma.operationsAuditEvent.create({
      data: {
        actorId: admin.id,
        action: "PLATFORM_CREDENTIAL_REVEALED",
        entityType: "PlatformCredential",
        entityId: chave,
      },
    });

    return NextResponse.json({ chave, valor });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Falha ao revelar credencial.";
    return NextResponse.json({ error: mensagem }, { status: 400 });
  }
}
