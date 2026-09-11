import { NextResponse, type NextRequest } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { isBureau, isSubjectKind, resumoDeCredito } from "@/lib/credito";
import { prisma } from "@/lib/prisma";
import { isServiceCall } from "@/lib/service-auth";

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!ehDono(admin.role)) return NextResponse.json({ error: "Só o dono da conta pode isto." }, { status: 403 });

  const resumo = await resumoDeCredito();
  return NextResponse.json({
    subjects: resumo.map((item) => ({
      ...item,
      leituras: item.leituras.map((l) => ({ ...l, readAt: l.readAt.toISOString() })),
      atual: item.atual ? { ...item.atual, readAt: item.atual.readAt.toISOString() } : null,
      anterior: item.anterior ? { ...item.anterior, readAt: item.anterior.readAt.toISOString() } : null,
    })),
  });
}

/**
 * Registra uma leitura. Aceita a sessão do dono (tela) ou chamada de serviço
 * (n8n, quando um fluxo conseguir ler o score de um e-mail ou de um app).
 */
export async function POST(request: NextRequest) {
  const servico = isServiceCall(request);
  const admin = servico ? null : await getAdmin();
  if (!servico) {
    if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    if (!ehDono(admin.role)) return NextResponse.json({ error: "Só o dono da conta pode isto." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    subjectKind?: unknown;
    bureau?: unknown;
    score?: unknown;
    maxScore?: unknown;
    readAt?: unknown;
    note?: unknown;
  };

  const subjectKind = typeof body.subjectKind === "string" ? body.subjectKind : "";
  const bureau = typeof body.bureau === "string" ? body.bureau : "";
  const score = Number.parseInt(String(body.score ?? ""), 10);
  const maxScore =
    body.maxScore === undefined || body.maxScore === null || body.maxScore === ""
      ? 1000
      : Number.parseInt(String(body.maxScore), 10);
  const readAt =
    typeof body.readAt === "string" && body.readAt ? new Date(body.readAt) : new Date();
  const note =
    typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 300) : null;

  if (!isSubjectKind(subjectKind)) {
    return NextResponse.json({ error: "Diga se a leitura é do CPF ou do CNPJ." }, { status: 400 });
  }
  if (!isBureau(bureau)) {
    return NextResponse.json(
      { error: "Informe de onde veio o score (Serasa, Boa Vista, Quod, SPC ou app do banco)." },
      { status: 400 },
    );
  }
  if (!Number.isFinite(maxScore) || maxScore <= 0) {
    return NextResponse.json({ error: "Escala inválida." }, { status: 400 });
  }
  if (!Number.isInteger(score) || score < 0 || score > maxScore) {
    return NextResponse.json({ error: `Informe um score entre 0 e ${maxScore}.` }, { status: 400 });
  }
  if (Number.isNaN(readAt.getTime()) || readAt.getTime() > Date.now() + 86_400_000) {
    return NextResponse.json({ error: "Informe uma data válida, não futura." }, { status: 400 });
  }

  const source = servico ? "N8N" : "MANUAL";
  const created = await prisma.$transaction(async (tx) => {
    const leitura = await tx.creditScoreReading.create({
      data: {
        subjectKind,
        bureau,
        score,
        maxScore,
        readAt,
        source,
        note,
        createdBy: admin?.id ?? "n8n",
      },
    });
    await tx.financeAuditEvent.create({
      data: {
        actorId: admin?.id ?? null,
        action: "CREDIT_SCORE_RECORDED",
        entityType: "CreditScoreReading",
        entityId: leitura.id.toString(),
        metadata: { subjectKind, bureau, score, maxScore, readAt: readAt.toISOString(), source },
      },
    });
    return leitura;
  });

  return NextResponse.json({ ok: true, id: created.id.toString() }, { status: 201 });
}
