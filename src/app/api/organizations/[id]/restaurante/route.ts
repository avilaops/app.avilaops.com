import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { cleanText, sameOrigin } from "@/lib/http";
import { chamarN8n, N8nIndisponivel } from "@/lib/n8n";
import { marcarEtapa } from "@/lib/onboarding-etapas";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";

type Acesso = { usuario: string; papel: string; senha: string };

type ResultadoRestaurante = {
  ok: boolean;
  criado: boolean;
  tenantId: string | null;
  slug: string;
  nome: string | null;
  situacao: string | null;
  url: string | null;
  entrada: string | null;
  senhaEmpresa: string | null;
  acessos: Acesso[];
  aviso: string | null;
  erro: string | null;
};

/**
 * "Criar restaurante" na ficha: o n8n ("Ávila OS — Criar restaurante") cria o
 * estabelecimento no Comandeiro (`app.comandeiro.com.br`) e devolve o endereço
 * e as senhas de estreia. O Comandeiro continua dono do estado da casa; aqui
 * fica o vínculo (slug + URL) e a auditoria.
 *
 * Gêmeo de `../loja/route.ts` de propósito — mesmo desenho, mesma regra de
 * "uma rota por ação, um workflow por ação" (contrato §4.1). O que muda é o
 * produto do outro lado e o fato de a resposta trazer segredo: as senhas de
 * setor existem em claro uma única vez, no instante em que a casa nasce, e por
 * isso NÃO são gravadas — vão para a tela e morrem ali.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!sameOrigin(request))
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  const organizacao = await prisma.organization.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      legalName: true,
      cpfCnpj: true,
      contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1 },
      organizationIntegrations: {
        where: { provider: "comandeiro" },
        select: { publicId: true, url: true },
      },
    },
  });
  if (!organizacao)
    return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

  if (organizacao.organizationIntegrations[0]?.publicId) {
    return NextResponse.json(
      {
        error: `Este cliente já tem o restaurante "${organizacao.organizationIntegrations[0].publicId}".`,
      },
      { status: 409 },
    );
  }

  /*
    O CNPJ é obrigatório aqui, e não no Comandeiro por acaso: lá ele é a
    IDENTIDADE da casa na entrada — é o que o garçom digita. Sem CNPJ na ficha
    não há restaurante para criar, e dizer isso agora é melhor do que gastar
    uma chamada ao n8n para receber a mesma recusa em 422.
  */
  const cnpj = (organizacao.cpfCnpj ?? "").replace(/\D/g, "");
  if (cnpj.length !== 14) {
    return NextResponse.json(
      { error: "O cliente precisa de um CNPJ de 14 dígitos na ficha antes de criar o restaurante." },
      { status: 422 },
    );
  }

  const contato = organizacao.contacts[0];
  const donoEmail = cleanText(body?.donoEmail, 160).toLowerCase() || contato?.email || "";
  const donoNome = cleanText(body?.donoNome, 120) || contato?.name || organizacao.name;

  if (!donoEmail) {
    return NextResponse.json(
      { error: "Informe o e-mail do responsável — é para onde vai a recuperação de senha." },
      { status: 422 },
    );
  }

  const plano = cleanText(body?.plano, 20).toLowerCase();

  let resultado: ResultadoRestaurante;
  try {
    resultado = await chamarN8n<ResultadoRestaurante>(
      "avila-os-restaurante",
      {
        slug: slugify(cleanText(body?.slug, 60) || organizacao.slug, 60),
        nome: cleanText(body?.nome, 120) || organizacao.name,
        cnpj,
        razaoSocial: organizacao.legalName ?? "",
        segmento: cleanText(body?.segmento, 60),
        whatsapp: cleanText(body?.whatsapp, 30) || contato?.whatsapp || contato?.phone || "",
        cidade: cleanText(body?.cidade, 80),
        uf: cleanText(body?.uf, 2).toUpperCase(),
        plano: ["essencial", "profissional", "premium"].includes(plano) ? plano : "essencial",
        donoNome,
        donoEmail,
        organizationId: organizacao.id,
        autor: admin.email ?? admin.nome,
      },
      { timeoutMs: 120_000 },
    );
  } catch (erro) {
    return NextResponse.json(
      { error: erro instanceof N8nIndisponivel ? erro.message : "Falha ao acionar o n8n." },
      { status: 502 },
    );
  }

  if (!resultado?.ok) {
    return NextResponse.json(
      { error: resultado?.erro || "O Comandeiro recusou a criação." },
      { status: 409 },
    );
  }

  await prisma.organizationIntegration.upsert({
    where: {
      organizationId_provider: { organizationId: organizacao.id, provider: "comandeiro" },
    },
    create: {
      organizationId: organizacao.id,
      provider: "comandeiro",
      publicId: resultado.slug,
      accountName: resultado.nome ?? organizacao.name,
      url: resultado.url,
      status: "ACTIVE",
      notes: resultado.situacao ? `Situação no Comandeiro: ${resultado.situacao}` : null,
    },
    update: { publicId: resultado.slug, url: resultado.url, status: "ACTIVE" },
  });

  await marcarEtapa(
    organizacao.id,
    "RESTAURANT",
    `Restaurante ${resultado.slug}${resultado.url ? ` · ${resultado.url}` : ""}`,
  );

  await prisma.operationsAuditEvent.create({
    data: {
      action: "RESTAURANT_PROVISIONED",
      entityType: "Organization",
      entityId: organizacao.id,
      organizationId: organizacao.id,
      actorId: admin.id,
      metadata: {
        slug: resultado.slug,
        url: resultado.url,
        situacao: resultado.situacao,
        criado: resultado.criado,
        // Sem `acessos` e sem `senhaEmpresa`: senha em claro não entra em
        // auditoria. O que fica registrado é que a casa nasceu, não como
        // entrar nela.
      },
    },
  });

  return NextResponse.json({ ...resultado, ok: true });
}
