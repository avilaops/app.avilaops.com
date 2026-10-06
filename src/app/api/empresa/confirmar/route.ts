import { NextRequest, NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import {
  VALIDADE_DA_CONFIRMACAO_SEGUNDOS,
  esperaPorFalhas,
  limparFalhas,
  registrarConfirmacao,
  registrarFalha,
  senhaConfere,
} from "@/lib/confirmacao-recente";
import { origemEstrita } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Confere a senha do dono e abre a janela curta em que ato sensível passa.
 *
 * Senha errada deixa rastro e conta para o bloqueio: quem está tentando
 * adivinhar numa sessão alheia aparece no histórico da empresa.
 */
export async function POST(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  if (!ehDono(admin.role)) {
    return NextResponse.json({ erro: "Só o dono da conta pode isto." }, { status: 403 });
  }
  if (!origemEstrita(request)) {
    return NextResponse.json({ erro: "Origem não autorizada." }, { status: 403 });
  }

  const espera = esperaPorFalhas(admin.id);
  if (espera > 0) {
    return NextResponse.json(
      { erro: `Muitas tentativas. Tente de novo em ${Math.ceil(espera / 60)} min.` },
      { status: 429, headers: { "retry-after": String(espera) } },
    );
  }

  const corpo = (await request.json().catch(() => null)) as { senha?: unknown } | null;
  const senha = typeof corpo?.senha === "string" ? corpo.senha : "";
  if (!senha) return NextResponse.json({ erro: "Informe a senha." }, { status: 400 });

  if (!(await senhaConfere(admin.id, senha))) {
    registrarFalha(admin.id);
    await prisma.operationsAuditEvent.create({
      data: {
        actorId: admin.id,
        action: "CONFIRMACAO_DE_SENHA_RECUSADA",
        entityType: "AdminIdentity",
        entityId: admin.id,
      },
    });
    return NextResponse.json(
      { erro: "Senha incorreta. É a senha deste painel, a do login por CPF ou e-mail." },
      { status: 401 },
    );
  }

  limparFalhas(admin.id);
  await registrarConfirmacao(admin.id);
  return NextResponse.json({ ok: true, validadeSegundos: VALIDADE_DA_CONFIRMACAO_SEGUNDOS });
}
