import { NextRequest, NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { ehEscopo, gerarChave } from "@/lib/chaves-api";
import { cleanText, origemEstrita } from "@/lib/http";
import { prisma } from "@/lib/prisma";

/** Validades oferecidas na tela. `0` = sem validade. */
const VALIDADES_EM_DIAS = new Set([0, 30, 90, 365]);

/**
 * Lista e criação de chaves de API.
 *
 * Só o dono, e só com sessão de gente: conceder acesso é uma das coisas que
 * `ehDono()` guarda, e uma chave não pode fabricar outra chave.
 */
export async function GET() {
  const admin = await getAdmin();
  if (!admin || !ehDono(admin.role)) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }

  const chaves = await prisma.chaveDeApi.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      nome: true,
      prefixo: true,
      escopos: true,
      ultimoUsoEm: true,
      expiraEm: true,
      revogadaEm: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ chaves });
}

export async function POST(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin || !ehDono(admin.role)) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }
  if (!origemEstrita(request)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  const corpo = (await request.json().catch(() => null)) as {
    nome?: unknown;
    escopos?: unknown;
    validadeEmDias?: unknown;
  } | null;

  const nome = cleanText(corpo?.nome, 80);
  if (nome.length < 3) {
    return NextResponse.json(
      { error: "Dê um nome que diga quem vai usar a chave (ex.: Claude Code)." },
      { status: 400 },
    );
  }

  const pedidos = Array.isArray(corpo?.escopos) ? corpo.escopos : [];
  const escopos = [...new Set(pedidos.filter(ehEscopo))];
  if (!escopos.length || escopos.length !== pedidos.length) {
    return NextResponse.json({ error: "Escolha ao menos um escopo válido." }, { status: 400 });
  }

  const validade = Number(corpo?.validadeEmDias ?? 90);
  if (!VALIDADES_EM_DIAS.has(validade)) {
    return NextResponse.json({ error: "Validade inválida." }, { status: 400 });
  }
  const expiraEm = validade ? new Date(Date.now() + validade * 24 * 60 * 60 * 1000) : null;

  const { segredo, prefixo, hash } = gerarChave();

  const chave = await prisma.$transaction(async (transacao) => {
    const criada = await transacao.chaveDeApi.create({
      data: { nome, prefixo, hash, escopos, criadaPor: admin.id, expiraEm },
      select: { id: true, nome: true, prefixo: true, escopos: true, expiraEm: true, createdAt: true },
    });
    await transacao.operationsAuditEvent.create({
      data: {
        actorId: admin.id,
        action: "API_KEY_CREATED",
        entityType: "ChaveDeApi",
        entityId: criada.id,
        metadata: { nome, prefixo, escopos, expiraEm: expiraEm?.toISOString() ?? null },
      },
    });
    return criada;
  });

  // Única vez que o segredo sai do servidor. Não há rota que o devolva depois.
  return NextResponse.json({ chave, segredo }, { status: 201 });
}
