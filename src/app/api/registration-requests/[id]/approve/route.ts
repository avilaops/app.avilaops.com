import { NextRequest, NextResponse } from "next/server";
import { garantirAcessoCliente, slugLivreDeOrganizacao, urlDeLogin, vincularContaAOrganizacao } from "@/lib/acesso-cliente";
import { getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { chamarN8n, N8nIndisponivel } from "@/lib/n8n";
import { prisma } from "@/lib/prisma";

/**
 * Aprovar uma solicitação de acesso = três coisas, nesta ordem:
 *
 * 1. A conta no SSO (`portal_clients`), criada aqui mesmo — o portal antigo
 *    que fazia isso foi desligado em 24/08/2026 e esta rota ficou chamando um
 *    host morto durante uma semana.
 * 2. A organização na carteira, se ainda não existe (por CNPJ/CPF), com o
 *    solicitante como contato principal.
 * 3. O e-mail com a senha provisória e a tarefa de onboarding, pelo n8n
 *    ("Ávila OS — Cliente aprovado"). Se o n8n falhar, a aprovação NÃO volta
 *    atrás: a conta existe; a senha vem na resposta para o admin repassar.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  const { id } = await params;
  const solicitacao = await prisma.clientRegistrationRequest.findUnique({ where: { id } });
  if (!solicitacao) {
    return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });
  }
  if (solicitacao.status !== "PENDING") {
    return NextResponse.json({ error: "Esta solicitação já foi processada." }, { status: 409 });
  }

  // 1. Conta no SSO
  let acesso;
  try {
    acesso = await garantirAcessoCliente({
      nome: solicitacao.nome,
      email: solicitacao.email,
      cpfCnpj: solicitacao.cpfCnpj,
      telefone: solicitacao.telefone,
    });
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

  // 2. Organização na carteira
  const documento = solicitacao.cpfCnpj.replace(/\D/g, "");
  let organizacao = documento
    ? await prisma.organization.findUnique({ where: { cpfCnpj: documento }, select: { id: true, name: true } })
    : null;
  let organizacaoCriada = false;

  if (!organizacao) {
    const nome = solicitacao.empresa?.trim() || solicitacao.nome.trim();
    const slug = await slugLivreDeOrganizacao(nome);
    organizacao = await prisma.organization.create({
      data: {
        name: nome,
        slug,
        cpfCnpj: documento || null,
        status: "ONBOARDING",
        brands: { create: { name: nome, slug: "principal" } },
        contacts: {
          create: {
            type: "OWNER",
            name: solicitacao.nome.trim(),
            email: solicitacao.email.trim().toLowerCase(),
            phone: solicitacao.telefone ?? null,
            isPrimary: true,
          },
        },
      },
      select: { id: true, name: true },
    });
    organizacaoCriada = true;
  }

  // 2b. Vínculo conta → empresa. É o que a área do cliente (/portal) lê para
  // saber o que mostrar; sem ele a pessoa entra e não vê nada que seja dela.
  const vinculada = await vincularContaAOrganizacao(acesso.id, organizacao.id);

  // 3. E-mail + tarefa pelo n8n
  let emailEnviado = false;
  let tarefa: string | null = null;
  let avisoN8n: string | null = null;
  if (acesso.senha) {
    try {
      const resultado = await chamarN8n<{ ok?: boolean; emailEnviado?: boolean; tarefa?: string | null }>(
        "avila-os-cliente-aprovado",
        {
          nome: solicitacao.nome,
          email: acesso.email,
          senha: acesso.senha,
          empresa: organizacao.name,
          telefone: solicitacao.telefone ?? "",
          loginUrl: urlDeLogin(),
          organizationId: organizacao.id,
          autor: admin.email ?? admin.nome,
        },
        { timeoutMs: 60_000 },
      );
      emailEnviado = Boolean(resultado.emailEnviado);
      tarefa = resultado.tarefa ?? null;
    } catch (erro) {
      avisoN8n = erro instanceof N8nIndisponivel ? erro.message : "Falha ao acionar o n8n.";
    }
  }

  await prisma.clientRegistrationRequest.update({
    where: { id },
    data: { status: "APPROVED", revisadoPorId: admin.id, revisadoEm: new Date() },
  });

  await prisma.operationsAuditEvent.create({
    data: {
      action: "CLIENT_REGISTRATION_REQUEST_APPROVED",
      entityType: "ClientRegistrationRequest",
      entityId: id,
      actorId: admin.id,
      organizationId: organizacao.id,
      metadata: {
        contaCriada: acesso.criado,
        organizacaoCriada,
        contaVinculada: vinculada,
        emailEnviado,
        tarefa,
        avisoN8n,
      },
    },
  });

  return NextResponse.json({
    ok: true,
    organizationId: organizacao.id,
    contaCriada: acesso.criado,
    organizacaoCriada,
    emailEnviado,
    tarefa,
    aviso: avisoN8n
      ? `Conta criada, mas o e-mail não saiu (${avisoN8n}).`
      : !acesso.criado
        ? "A conta já existia; nenhum e-mail foi enviado. Use \"Reenviar acesso\" na ficha do cliente."
        : null,
    // Só aparece quando o e-mail não foi — o admin repassa por outro canal.
    senhaProvisoria: acesso.senha && !emailEnviado ? acesso.senha : null,
  });
}
