import { NextRequest, NextResponse } from "next/server";
import {
  buscarContaPorEmail,
  garantirAcessoCliente,
  redefinirSenhaProvisoria,
  urlDeLogin,
} from "@/lib/acesso-cliente";
import { ehDono, getAdmin } from "@/lib/auth";
import { cleanText, sameOrigin } from "@/lib/http";
import { chamarN8n, N8nIndisponivel } from "@/lib/n8n";
import { marcarEtapa } from "@/lib/onboarding-etapas";
import { prisma } from "@/lib/prisma";

/**
 * Acesso do cliente ao SSO, pela ficha. `acao: "criar"` cria a conta para o
 * contato principal (ou para o e-mail informado); `acao: "reenviar"` gera
 * senha provisória nova para a conta existente. Nos dois casos o e-mail sai
 * pelo n8n ("Ávila OS — Cliente aprovado").
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  // Dinheiro, segredo e acesso são do dono; a equipe para aqui.
  if (!ehDono(admin.role)) return NextResponse.json({ error: "Só o dono da conta pode isto." }, { status: 403 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const acao = cleanText(body?.acao, 12) === "reenviar" ? "reenviar" : "criar";

  const organizacao = await prisma.organization.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      cpfCnpj: true,
      contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1 },
    },
  });
  if (!organizacao) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

  const contato = organizacao.contacts[0];
  const email = (cleanText(body?.email, 160) || contato?.email || "").trim().toLowerCase();
  const nome = cleanText(body?.nome, 120) || contato?.name || organizacao.name;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json(
      { error: "Informe um e-mail válido ou cadastre o contato principal com e-mail." },
      { status: 400 },
    );
  }

  let contaId: string;
  let senha: string | null = null;
  let criado = false;

  try {
    if (acao === "reenviar") {
      const conta = await buscarContaPorEmail(email);
      if (!conta) return NextResponse.json({ error: "Não existe conta para este e-mail." }, { status: 404 });
      contaId = conta.id;
      senha = await redefinirSenhaProvisoria(conta.id);
    } else {
      const acesso = await garantirAcessoCliente({
        nome,
        email,
        cpfCnpj: organizacao.cpfCnpj,
        telefone: contato?.phone ?? contato?.whatsapp ?? null,
      });
      contaId = acesso.id;
      senha = acesso.senha;
      criado = acesso.criado;
      if (!criado) {
        return NextResponse.json({
          ok: true,
          criado: false,
          email,
          aviso: "A conta já existia. Use \"Reenviar acesso\" para gerar uma senha nova.",
        });
      }
    }
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "";
    return NextResponse.json(
      {
        error: /unique|duplic/i.test(mensagem)
          ? "Já existe uma conta com este CPF/CNPJ em outro e-mail. Ajuste no auth.avilaops.com/admin."
          : "Não foi possível criar a conta de acesso.",
      },
      { status: 409 },
    );
  }

  let emailEnviado = false;
  let tarefa: string | null = null;
  let aviso: string | null = null;
  try {
    const resultado = await chamarN8n<{ emailEnviado?: boolean; tarefa?: string | null }>(
      "avila-os-cliente-aprovado",
      {
        nome,
        email,
        senha,
        empresa: organizacao.name,
        telefone: contato?.phone ?? "",
        loginUrl: urlDeLogin(),
        organizationId: organizacao.id,
        autor: admin.email ?? admin.nome,
      },
      { timeoutMs: 60_000 },
    );
    emailEnviado = Boolean(resultado.emailEnviado);
    tarefa = resultado.tarefa ?? null;
  } catch (erro) {
    aviso = erro instanceof N8nIndisponivel ? erro.message : "Falha ao acionar o n8n.";
  }

  await marcarEtapa(organizacao.id, "ACCESS", `Conta ${email}${emailEnviado ? " · e-mail enviado" : ""}`);

  await prisma.operationsAuditEvent.create({
    data: {
      action: acao === "reenviar" ? "CLIENT_ACCESS_RESENT" : "CLIENT_ACCESS_CREATED",
      entityType: "Organization",
      entityId: organizacao.id,
      organizationId: organizacao.id,
      actorId: admin.id,
      metadata: { email, contaId, emailEnviado, tarefa, aviso },
    },
  });

  return NextResponse.json({
    ok: true,
    criado,
    email,
    emailEnviado,
    tarefa,
    aviso: aviso ? `Conta pronta, mas o e-mail não saiu (${aviso}).` : null,
    senhaProvisoria: senha && !emailEnviado ? senha : null,
  });
}
