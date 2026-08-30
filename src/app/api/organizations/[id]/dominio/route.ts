import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { cleanText, sameOrigin } from "@/lib/http";
import { chamarN8n, N8nIndisponivel } from "@/lib/n8n";
import { marcarEtapa } from "@/lib/onboarding-etapas";
import { prisma } from "@/lib/prisma";

type RegistroCriado = {
  type: string;
  name: string;
  content: string;
  ok: boolean;
  id: string | null;
  erro: string | null;
};

type RegistroExistente = {
  type: string;
  name: string;
  content: string;
  id: string;
  conteudoAtual: string;
};

export type ResultadoDominio = {
  ok: boolean;
  dominio: string;
  zoneId: string;
  zoneStatus: string;
  nameServers: string[];
  zonaCriada: boolean;
  registrosCriados: RegistroCriado[];
  registrosExistentes: RegistroExistente[];
  mail: { provisionamento: unknown; verificacao: unknown };
};

/**
 * "Adicionar domínio" na ficha: o n8n ("Ávila OS — Onboarding de domínio")
 * acha ou cria a zona na Cloudflare, provisiona o domínio no mail e publica
 * o DNS padrão da casa. Aqui a gente grava o que voltou: `DomainAsset`,
 * `DnsRecord` por registro e a integração de e-mail do domínio.
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
  const dominio = cleanText(body?.dominio, 253)
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(dominio)) {
    return NextResponse.json({ error: "Informe um domínio válido (ex.: cliente.com.br)." }, { status: 400 });
  }
  const site = cleanText(body?.site, 12) === "nenhum" ? "nenhum" : "hetzner";

  const organizacao = await prisma.organization.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1 },
    },
  });
  if (!organizacao) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

  const existente = await prisma.domainAsset.findUnique({ where: { fqdn: dominio }, select: { organizationId: true } });
  if (existente && existente.organizationId !== organizacao.id) {
    return NextResponse.json({ error: "Este domínio já pertence a outro cliente." }, { status: 409 });
  }

  let resultado: ResultadoDominio;
  try {
    resultado = await chamarN8n<ResultadoDominio>(
      "avila-os-dominio",
      {
        dominio,
        organizacao: organizacao.name,
        organizationId: organizacao.id,
        contatoEmail: organizacao.contacts[0]?.email ?? "",
        site,
        autor: admin.email ?? admin.nome,
      },
      { timeoutMs: 180_000 },
    );
  } catch (erro) {
    return NextResponse.json(
      { error: erro instanceof N8nIndisponivel ? erro.message : "Falha ao acionar o n8n." },
      { status: 502 },
    );
  }

  if (!resultado?.ok || !resultado.zoneId) {
    return NextResponse.json({ error: "O n8n não devolveu a zona do domínio.", detalhe: resultado }, { status: 502 });
  }

  const agora = new Date();
  const asset = await prisma.domainAsset.upsert({
    where: { fqdn: dominio },
    create: {
      organizationId: organizacao.id,
      fqdn: dominio,
      status: "ACTIVE",
      cloudflareZoneId: resultado.zoneId,
      cloudflareStatus: resultado.zoneStatus ?? null,
      dnsLastSyncedAt: agora,
    },
    update: {
      cloudflareZoneId: resultado.zoneId,
      cloudflareStatus: resultado.zoneStatus ?? null,
      dnsLastSyncedAt: agora,
    },
    select: { id: true },
  });

  const registros = [
    ...(resultado.registrosCriados ?? []).filter((r) => r.ok && r.id).map((r) => ({ ...r, id: r.id as string })),
    ...(resultado.registrosExistentes ?? []).map((r) => ({ ...r, content: r.conteudoAtual || r.content })),
  ];
  for (const registro of registros) {
    await prisma.dnsRecord.upsert({
      where: { cloudflareRecordId: registro.id },
      create: {
        domainAssetId: asset.id,
        cloudflareRecordId: registro.id,
        type: registro.type,
        name: registro.name,
        content: registro.content,
        proxied: registro.type === "A" || registro.type === "CNAME" ? !registro.name.includes("_domainkey") : false,
        ttl: 1,
      },
      update: { type: registro.type, name: registro.name, content: registro.content },
    });
  }

  const verificacao = resultado.mail?.verificacao as { verified?: boolean; status?: string } | null;
  const mailVerificado = Boolean(verificacao?.verified || verificacao?.status === "active");
  await prisma.organizationIntegration.upsert({
    where: { organizationId_provider: { organizationId: organizacao.id, provider: `mail_domain:${dominio}` } },
    create: {
      organizationId: organizacao.id,
      provider: `mail_domain:${dominio}`,
      publicId: dominio,
      status: mailVerificado ? "ACTIVE" : "PENDING",
      notes: mailVerificado ? "DNS verificado pelo mail.avilaops.com" : "Aguardando o DNS propagar (nameservers na Cloudflare)",
    },
    update: {
      status: mailVerificado ? "ACTIVE" : "PENDING",
      notes: mailVerificado ? "DNS verificado pelo mail.avilaops.com" : "Aguardando o DNS propagar (nameservers na Cloudflare)",
    },
  });

  await marcarEtapa(organizacao.id, "DOMAIN", `${dominio} · zona ${resultado.zoneStatus}${mailVerificado ? " · e-mail verificado" : ""}`);

  await prisma.operationsAuditEvent.create({
    data: {
      action: "DOMAIN_PROVISIONED",
      entityType: "DomainAsset",
      entityId: asset.id,
      organizationId: organizacao.id,
      actorId: admin.id,
      metadata: {
        dominio,
        site,
        zoneId: resultado.zoneId,
        zonaCriada: resultado.zonaCriada,
        criados: (resultado.registrosCriados ?? []).length,
        existentes: (resultado.registrosExistentes ?? []).length,
        mailVerificado,
      },
    },
  });

  return NextResponse.json({ ...resultado, ok: true, assetId: asset.id, mailVerificado });
}

/**
 * Arquivar (ou reativar) um domínio da ficha. Arquivado sai das auditorias
 * diárias, da renovação e do IndexNow — é o caso do domínio comprado por
 * engano ou devolvido ao cliente. Nunca apaga: histórico de DNS e auditoria
 * continuam pendurados nele.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const fqdn = cleanText(body?.fqdn, 253).toLowerCase();
  const acao = cleanText(body?.acao, 12) === "reativar" ? "reativar" : "arquivar";

  const asset = await prisma.domainAsset.findFirst({ where: { fqdn, organizationId: id }, select: { id: true, status: true } });
  if (!asset) return NextResponse.json({ error: "Domínio não encontrado neste cliente." }, { status: 404 });

  const status = acao === "arquivar" ? "ARCHIVED" : "ACTIVE";
  await prisma.domainAsset.update({ where: { id: asset.id }, data: { status } });
  await prisma.operationsAuditEvent.create({
    data: {
      action: acao === "arquivar" ? "DOMAIN_ARCHIVED" : "DOMAIN_REACTIVATED",
      entityType: "DomainAsset",
      entityId: asset.id,
      organizationId: id,
      actorId: admin.id,
      metadata: { fqdn, de: asset.status, para: status, motivo: cleanText(body?.motivo, 200) || null },
    },
  });

  return NextResponse.json({ ok: true, fqdn, status });
}
