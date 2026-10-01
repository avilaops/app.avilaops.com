import { NextRequest, NextResponse } from "next/server";
import { ehDonoDoNegocio, getSessaoPortal } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { participaDaEmpresa } from "@/lib/nucleo/acesso";
import {
  criarUsuarioDaEmpresa,
  definirAtivoNaEmpresa,
  listarUsuariosDaEmpresa,
  redefinirSenhaNaEmpresa,
  UsuarioInvalido,
} from "@/lib/usuarios-do-cliente";

/**
 * Equipe da empresa, administrada pelo dono do negócio.
 *
 * A empresa vem sempre da sessão (`organizationId` da conta), nunca do corpo
 * ou da URL: é o que impede o dono de um negócio mexer na equipe de outro.
 * Só `ADMIN` entra aqui — `CLIENT` usa o produto, não administra gente.
 */
async function donoDaVez() {
  const sessao = await getSessaoPortal();
  if (!sessao) return { erro: NextResponse.json({ error: "Não autorizado." }, { status: 401 }) };
  if (!ehDonoDoNegocio(sessao.role)) {
    return { erro: NextResponse.json({ error: "Só o dono do negócio administra a equipe." }, { status: 403 }) };
  }
  if (!sessao.organizationId) {
    return { erro: NextResponse.json({ error: "Sua conta ainda não está ligada a uma empresa." }, { status: 409 }) };
  }
  if (!(await participaDaEmpresa(sessao.id, sessao.organizationId, true))) {
    return { erro: NextResponse.json({ error: "Sua participação não permite administrar esta empresa." }, { status: 403 }) };
  }
  return { sessao, organizationId: sessao.organizationId };
}

export async function GET() {
  const r = await donoDaVez();
  if (r.erro) return r.erro;
  return NextResponse.json({ usuarios: await listarUsuariosDaEmpresa(r.organizationId) });
}

export async function POST(request: NextRequest) {
  const r = await donoDaVez();
  if (r.erro) return r.erro;
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  const corpo = (await request.json().catch(() => null)) as
    | { nome?: string; email?: string; telefone?: string; papel?: string; acao?: string; id?: string; ativo?: boolean }
    | null;
  if (!corpo) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });

  try {
    // Uma rota só para as três ações porque são a mesma tela e o mesmo dono.
    if (corpo.acao === "ativo" && corpo.id) {
      const usuario = await definirAtivoNaEmpresa(r.organizationId, corpo.id, corpo.ativo !== false, r.sessao.id);
      return NextResponse.json({ ok: true, usuario });
    }
    if (corpo.acao === "senha" && corpo.id) {
      const senha = await redefinirSenhaNaEmpresa(r.organizationId, corpo.id);
      return NextResponse.json({ ok: true, senha });
    }

    const { usuario, senha } = await criarUsuarioDaEmpresa(r.organizationId, {
      nome: corpo.nome ?? "",
      email: corpo.email ?? "",
      telefone: corpo.telefone,
      papel: corpo.papel === "ADMIN" ? "ADMIN" : "CLIENT",
    });

    await prisma.operationsAuditEvent.create({
      data: {
        action: "PORTAL_USER_CREATED",
        entityType: "PortalClient",
        entityId: usuario.id,
        actorId: r.sessao.id,
        organizationId: r.organizationId,
        metadata: { email: usuario.email, papel: usuario.papel },
      },
    });

    // A senha vai em claro uma vez só, para o dono repassar. Não fica salva.
    return NextResponse.json({ ok: true, usuario, senha }, { status: 201 });
  } catch (erro) {
    if (erro instanceof UsuarioInvalido) return NextResponse.json({ error: erro.message }, { status: 422 });
    console.error("[portal/usuarios]", erro);
    return NextResponse.json({ error: "Não foi possível concluir." }, { status: 500 });
  }
}
