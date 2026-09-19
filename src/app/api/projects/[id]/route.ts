import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { cleanText, sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const PRIORIDADES = new Set(["LOW", "MEDIUM", "HIGH", "URGENT"]);
const ESTADOS = new Set(["PLANNING", "ACTIVE", "WAITING", "DONE", "CANCELLED"]);

/**
 * Edita o que o projeto é: título, descrição, link, responsável, prioridade,
 * estado e prazo.
 *
 * Só altera o que vier no corpo. Mandar o registro inteiro a cada edição faria
 * a tela que edita a descrição apagar o prazo que outra pessoa acabou de pôr,
 * e o culpado apareceria como "sumiu sozinho".
 *
 * Cliente e marca ficam de fora de propósito: mudar de dono é mover o projeto
 * entre empresas, com tarefa, entregável e arquivo atrás. Isso é outra
 * operação, não um campo de formulário.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  const { id } = await params;
  const projeto = await prisma.project.findUnique({
    where: { id },
    select: { id: true, organizationId: true },
  });
  if (!projeto) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const corpo = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const dados: {
    title?: string;
    description?: string | null;
    url?: string | null;
    ownerName?: string | null;
    priority?: string;
    status?: string;
    dueAt?: Date | null;
  } = {};

  if ("title" in corpo) {
    const titulo = cleanText(corpo.title, 160);
    if (titulo.length < 3) {
      return NextResponse.json(
        { error: "Informe um título com pelo menos 3 caracteres." },
        { status: 400 },
      );
    }
    dados.title = titulo;
  }

  if ("description" in corpo) {
    const descricao = cleanText(corpo.description, 4000);
    dados.description = descricao || null;
  }

  if ("url" in corpo) {
    const link = cleanText(corpo.url, 500);
    if (link) {
      // Mesma regra da criação: link que não é http(s) não serve, e ainda abre
      // espaço para um `javascript:` ir parar num href da tela.
      let esquema = "";
      try {
        esquema = new URL(link).protocol;
      } catch {
        esquema = "";
      }
      if (esquema !== "http:" && esquema !== "https:") {
        return NextResponse.json(
          { error: "Informe uma URL começando com http:// ou https://." },
          { status: 400 },
        );
      }
    }
    dados.url = link || null;
  }

  if ("ownerName" in corpo) {
    const responsavel = cleanText(corpo.ownerName, 100);
    dados.ownerName = responsavel || null;
  }

  if ("priority" in corpo) {
    const prioridade = cleanText(corpo.priority, 10).toUpperCase();
    if (!PRIORIDADES.has(prioridade)) {
      return NextResponse.json({ error: "Prioridade inválida." }, { status: 400 });
    }
    dados.priority = prioridade;
  }

  if ("status" in corpo) {
    const estado = cleanText(corpo.status, 12).toUpperCase();
    if (!ESTADOS.has(estado)) {
      return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
    }
    dados.status = estado;
  }

  if ("dueAt" in corpo) {
    const prazo = cleanText(corpo.dueAt, 40);
    if (!prazo) {
      dados.dueAt = null;
    } else {
      const data = new Date(prazo);
      if (Number.isNaN(data.getTime())) {
        return NextResponse.json({ error: "Prazo inválido." }, { status: 400 });
      }
      dados.dueAt = data;
    }
  }

  if (Object.keys(dados).length === 0) {
    return NextResponse.json({ error: "Nada para alterar." }, { status: 400 });
  }

  const atualizado = await prisma.$transaction(async (transacao) => {
    const projetoAtualizado = await transacao.project.update({
      where: { id: projeto.id },
      data: dados,
      select: {
        id: true,
        title: true,
        description: true,
        url: true,
        ownerName: true,
        priority: true,
        status: true,
        dueAt: true,
      },
    });

    await transacao.operationsAuditEvent.create({
      data: {
        actorId: admin.id,
        organizationId: projeto.organizationId,
        action: "PROJECT_UPDATED",
        entityType: "Project",
        entityId: projeto.id,
        // Só os nomes dos campos: o histórico precisa dizer o que mexeram, e
        // guardar o conteúdo aqui duplicaria dado que já está na própria linha.
        metadata: { campos: Object.keys(dados) },
      },
    });

    return projetoAtualizado;
  });

  return NextResponse.json({ project: atualizado });
}
