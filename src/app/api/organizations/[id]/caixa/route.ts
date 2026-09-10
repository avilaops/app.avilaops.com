import { NextRequest, NextResponse } from "next/server";
import { buscarContaPorEmail, gerarSenhaProvisoria } from "@/lib/acesso-cliente";
import { getAdmin } from "@/lib/auth";
import { cleanText, sameOrigin } from "@/lib/http";
import { chamarN8n, N8nIndisponivel } from "@/lib/n8n";
import { marcarEtapa } from "@/lib/onboarding-etapas";
import { prisma } from "@/lib/prisma";

/**
 * "Criar caixa de e-mail" na ficha. Vai pelo mesmo webhook que o /admin do
 * auth usa ("Auth — Criar caixa de e-mail"), que fala com o mail.avilaops.com.
 * A caixa nasce com troca de senha obrigatória; a senha aparece uma vez na
 * resposta e o mail avisa o contato por e-mail (sem a senha).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const dominio = cleanText(body?.dominio, 253).toLowerCase();
  const usuario = cleanText(body?.usuario, 64).toLowerCase().replace(/[^a-z0-9._-]/g, "");
  const nome = cleanText(body?.nome, 120);
  const senhaInformada = cleanText(body?.senha, 128);

  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(dominio)) {
    return NextResponse.json({ error: "Escolha um domínio do cliente." }, { status: 400 });
  }
  if (!usuario) {
    return NextResponse.json({ error: "Informe o usuário da caixa (a parte antes do @)." }, { status: 400 });
  }

  const organizacao = await prisma.organization.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      domains: { where: { fqdn: dominio }, select: { id: true } },
      contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1 },
    },
  });
  if (!organizacao) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  if (organizacao.domains.length === 0) {
    return NextResponse.json({ error: "Adicione o domínio ao cliente antes de criar a caixa." }, { status: 409 });
  }

  const contatoEmail = organizacao.contacts[0]?.email?.trim().toLowerCase() ?? "";
  const donoSso = contatoEmail ? await buscarContaPorEmail(contatoEmail) : null;
  const senha = senhaInformada || gerarSenhaProvisoria();
  const endereco = `${usuario}@${dominio}`;

  let resultado: { ok?: boolean; address?: string; quotaGb?: number; webmail?: string; erro?: string; status?: number };
  try {
    resultado = await chamarN8n(
      "auth-criar-caixa",
      {
        domain: dominio,
        username: usuario,
        password: senha,
        displayName: nome || organizacao.name,
        ownerEmail: donoSso ? contatoEmail : "",
        notifyTo: contatoEmail,
        autor: admin.email ?? admin.nome,
      },
      { timeoutMs: 60_000 },
    );
  } catch (erro) {
    return NextResponse.json(
      { error: erro instanceof N8nIndisponivel ? erro.message : "Falha ao acionar o n8n." },
      { status: 502 },
    );
  }

  if (!resultado?.ok) {
    return NextResponse.json(
      { error: resultado?.erro || "O mail.avilaops.com recusou a caixa." },
      { status: 409 },
    );
  }

  const address = resultado.address || endereco;
  // Isto é trilha do que ESTA tela provisionou, não a lista de caixas do
  // cliente. Desde 10/09/2026 a ficha pergunta ao mail (src/lib/mail.ts) em vez
  // de ler daqui: como espelho, esta tabela mentia sempre que a caixa nascia
  // por outro caminho. Não voltar a usá-la para responder "quais caixas existem".
  await prisma.organizationIntegration.upsert({
    where: { organizationId_provider: { organizationId: organizacao.id, provider: `mailbox:${address}` } },
    create: {
      organizationId: organizacao.id,
      provider: `mailbox:${address}`,
      publicId: address,
      accountName: nome || null,
      url: resultado.webmail ?? "https://mail.avilaops.com",
      status: "ACTIVE",
      notes: resultado.quotaGb ? `${resultado.quotaGb} GB` : null,
    },
    update: { status: "ACTIVE", accountName: nome || null, url: resultado.webmail ?? undefined },
  });

  await marcarEtapa(organizacao.id, "EMAIL", `Caixa ${address}`);

  await prisma.operationsAuditEvent.create({
    data: {
      action: "MAILBOX_PROVISIONED",
      entityType: "Organization",
      entityId: organizacao.id,
      organizationId: organizacao.id,
      actorId: admin.id,
      metadata: { address, notifyTo: contatoEmail, ownerSso: Boolean(donoSso) },
    },
  });

  return NextResponse.json({
    ok: true,
    address,
    webmail: resultado.webmail ?? "https://mail.avilaops.com",
    quotaGb: resultado.quotaGb ?? null,
    // A senha só existe aqui, uma vez. O mail avisa o contato sem ela.
    senha: senhaInformada ? null : senha,
    avisadoEm: contatoEmail || null,
  });
}
