import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { cleanText, sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { ERRO_URL_DE_PROJETO, urlDeProjetoValida } from "@/lib/projects";

const PRIORIDADES = new Set(["LOW", "MEDIUM", "HIGH", "URGENT"]);

/**
 * Edição de projeto.
 *
 * Até aqui, descrição, link e prazo só entravam na abertura: errar o escopo ou
 * colar o link errado significava viver com o erro, porque não havia tela para
 * corrigir. O cadastro de mídia já podia ir e vir; o texto ao lado dela, não.
 *
 * Campo ausente no corpo fica como está — o formulário manda só o que mexeu, e
 * um PUT que zera o que não veio apagaria o prazo de quem só quis trocar o
 * título. String vazia é diferente de ausente: ela limpa o campo, porque
 * apagar a descrição precisa ser possível.
 */
export async function PATCH(request: NextRequest, contexto: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  const { id } = await contexto.params;
  const corpo = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const projeto = await prisma.project.findUnique({
    where: { id },
    select: { id: true, organizationId: true, title: true },
  });
  if (!projeto) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const dados: {
    title?: string;
    description?: string | null;
    url?: string | null;
    priority?: string;
    ownerName?: string | null;
    dueAt?: Date | null;
  } = {};
  const alterados: string[] = [];

  if ("title" in corpo) {
    const title = cleanText(corpo.title, 160);
    if (title.length < 3) {
      return NextResponse.json(
        { error: "Informe um título com pelo menos 3 caracteres." },
        { status: 400 },
      );
    }
    dados.title = title;
    alterados.push("title");
  }

  if ("description" in corpo) {
    const description = cleanText(corpo.description, 4000);
    dados.description = description || null;
    alterados.push("description");
  }

  if ("url" in corpo) {
    const url = cleanText(corpo.url, 500);
    if (!urlDeProjetoValida(url)) {
      return NextResponse.json({ error: ERRO_URL_DE_PROJETO }, { status: 400 });
    }
    dados.url = url || null;
    alterados.push("url");
  }

  if ("priority" in corpo) {
    const priority = cleanText(corpo.priority, 10).toUpperCase();
    if (!PRIORIDADES.has(priority)) {
      return NextResponse.json({ error: "Prioridade inválida." }, { status: 400 });
    }
    dados.priority = priority;
    alterados.push("priority");
  }

  if ("ownerName" in corpo) {
    const ownerName = cleanText(corpo.ownerName, 100);
    dados.ownerName = ownerName || null;
    alterados.push("ownerName");
  }

  if ("dueAt" in corpo) {
    const bruto = cleanText(corpo.dueAt, 40);
    if (!bruto) {
      dados.dueAt = null;
    } else {
      const prazo = new Date(bruto);
      if (Number.isNaN(prazo.getTime())) {
        return NextResponse.json({ error: "Prazo inválido." }, { status: 400 });
      }
      dados.dueAt = prazo;
    }
    alterados.push("dueAt");
  }

  if (!alterados.length) {
    return NextResponse.json({ error: "Nada para alterar." }, { status: 400 });
  }

  const atualizado = await prisma.$transaction(async (transacao) => {
    const projetoAtualizado = await transacao.project.update({
      where: { id },
      data: dados,
      select: {
        id: true,
        title: true,
        description: true,
        url: true,
        priority: true,
        ownerName: true,
        dueAt: true,
      },
    });

    // Quais campos mudaram, e não os valores: descrição de projeto é texto de
    // cliente, e a trilha de auditoria não é lugar para guardar cópia dela.
    await transacao.operationsAuditEvent.create({
      data: {
        actorId: admin.id,
        organizationId: projeto.organizationId,
        action: "PROJECT_UPDATED",
        entityType: "Project",
        entityId: id,
        metadata: { campos: alterados },
      },
    });

    return projetoAtualizado;
  });

  return NextResponse.json({
    ok: true,
    project: {
      ...atualizado,
      dueAt: atualizado.dueAt ? atualizado.dueAt.toISOString() : null,
    },
  });
}
