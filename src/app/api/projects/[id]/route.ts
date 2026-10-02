import { NextRequest, NextResponse } from "next/server";
import { getAdminOuChave, rastroDaChave } from "@/lib/chaves-api";
import { cleanText, sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { ERRO_URL_DE_PROJETO, getProjectDetail, urlDeProjetoValida } from "@/lib/projects";

const PRIORIDADES = new Set(["LOW", "MEDIUM", "HIGH", "URGENT"]);

/** Projeto com tarefas e mídia — o mesmo que a tela do projeto mostra. */
export async function GET(request: NextRequest, contexto: { params: Promise<{ id: string }> }) {
  const { admin, erro } = await getAdminOuChave(request, "projetos:ler");
  if (!admin) {
    return NextResponse.json({ error: erro ?? "Acesso não autorizado." }, { status: 401 });
  }

  const { id } = await contexto.params;
  const project = await getProjectDetail(id);
  if (!project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }
  return NextResponse.json({ project });
}

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
  const { admin, erro } = await getAdminOuChave(request, "projetos:escrever");
  if (!admin) {
    return NextResponse.json({ error: erro ?? "Acesso não autorizado." }, { status: 401 });
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
    select: {
      id: true,
      organizationId: true,
      title: true,
      description: true,
      url: true,
      priority: true,
      ownerName: true,
      dueAt: true,
    },
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

  /**
   * Só entra em `alterados` o campo que mudou de verdade.
   *
   * O formulário manda os seis campos toda vez, mudando um ou não mudando
   * nenhum. Registrar os seis a cada salvamento faria a trilha de auditoria
   * dizer que tudo mudou quando só o título mudou — e uma trilha que exagera
   * não serve para auditar nada.
   */
  function anotar<T>(campo: string, novo: T, atual: T) {
    const mesmo =
      novo instanceof Date && atual instanceof Date
        ? novo.getTime() === atual.getTime()
        : novo === atual;
    if (mesmo) return false;
    alterados.push(campo);
    return true;
  }

  if ("title" in corpo) {
    const title = cleanText(corpo.title, 160);
    if (title.length < 3) {
      return NextResponse.json(
        { error: "Informe um título com pelo menos 3 caracteres." },
        { status: 400 },
      );
    }
    if (anotar("title", title, projeto.title)) dados.title = title;
  }

  if ("description" in corpo) {
    const description = cleanText(corpo.description, 4000) || null;
    if (anotar("description", description, projeto.description)) {
      dados.description = description;
    }
  }

  if ("url" in corpo) {
    const url = cleanText(corpo.url, 500);
    if (!urlDeProjetoValida(url)) {
      return NextResponse.json({ error: ERRO_URL_DE_PROJETO }, { status: 400 });
    }
    if (anotar("url", url || null, projeto.url)) dados.url = url || null;
  }

  if ("priority" in corpo) {
    const priority = cleanText(corpo.priority, 10).toUpperCase();
    if (!PRIORIDADES.has(priority)) {
      return NextResponse.json({ error: "Prioridade inválida." }, { status: 400 });
    }
    if (anotar("priority", priority, projeto.priority)) dados.priority = priority;
  }

  if ("ownerName" in corpo) {
    const ownerName = cleanText(corpo.ownerName, 100) || null;
    if (anotar("ownerName", ownerName, projeto.ownerName)) dados.ownerName = ownerName;
  }

  if ("dueAt" in corpo) {
    const bruto = cleanText(corpo.dueAt, 40);
    let prazo: Date | null = null;
    if (bruto) {
      prazo = new Date(bruto);
      if (Number.isNaN(prazo.getTime())) {
        return NextResponse.json({ error: "Prazo inválido." }, { status: 400 });
      }
    }

    const atual = projeto.dueAt ?? null;
    // O campo do formulário é `date`: só sabe dizer o dia. O banco guarda o
    // instante. Comparar instante com instante acusaria mudança sempre que o
    // prazo tivesse hora — o operador abria, salvava sem tocar em nada, e a
    // auditoria registrava "dueAt alterado" enquanto a hora era zerada para a
    // meia-noite. Por isso a comparação é por dia, na mesma convenção que a
    // tela usa para preencher o campo.
    const soData = /^\d{4}-\d{2}-\d{2}$/.test(bruto);
    const mesmoDia =
      soData && atual ? atual.toISOString().slice(0, 10) === bruto : false;
    const mudou = mesmoDia
      ? false
      : prazo && atual
        ? prazo.getTime() !== atual.getTime()
        : prazo !== atual;

    if (mudou) {
      alterados.push("dueAt");
      dados.dueAt = prazo;
    }
  }

  // Salvar sem mudar nada não é erro: é o operador abrindo, relendo e fechando.
  // Devolver 400 aqui faria a tela acusar falha de uma ação que deu certo.
  if (!alterados.length) {
    return NextResponse.json({ ok: true, semAlteracao: true });
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
        metadata: { ...rastroDaChave(admin), campos: alterados },
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
