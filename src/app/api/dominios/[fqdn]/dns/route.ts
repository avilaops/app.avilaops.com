import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { exigirDominio } from "@/lib/dominio";
import { provedorDeDns, tipoDnsValido, type EntradaRegistroDns } from "@/lib/dominios/dns";
import { cleanText, sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Escrita de DNS de um domínio: criar, alterar e apagar registro.
 *
 * Três guardas, nesta ordem, porque apagar um registro derruba site e e-mail
 * em minutos:
 *
 * 1. sessão de admin e mesma origem (não aceita chave de serviço: isto é ação
 *    de gente, com confirmação na tela, não tarefa de robô);
 * 2. o domínio precisa estar na carteira e ter zona conhecida, então o id de
 *    zona nunca vem do cliente;
 * 3. todo resultado, inclusive falha, vira evento de auditoria.
 */

type Corpo = {
  registroId?: unknown;
  tipo?: unknown;
  nome?: unknown;
  conteudo?: unknown;
  ttl?: unknown;
  prioridade?: unknown;
};

async function resolverZona(fqdnBruto: string) {
  const fqdn = exigirDominio(fqdnBruto);
  const dominio = await prisma.domainAsset.findUnique({
    where: { fqdn },
    select: { id: true, fqdn: true, cloudflareZoneId: true, organizationId: true },
  });

  if (!dominio) throw new Error("Domínio não encontrado na carteira.");
  if (!dominio.cloudflareZoneId) throw new Error("Este domínio não tem zona de DNS nesta plataforma.");
  return dominio;
}

function lerEntrada(corpo: Corpo): EntradaRegistroDns {
  const tipo = cleanText(corpo.tipo, 10).toUpperCase();
  if (!tipoDnsValido(tipo)) throw new Error("Tipo de registro não suportado.");

  const nome = cleanText(corpo.nome, 253);
  const conteudo = cleanText(corpo.conteudo, 2048);
  if (!nome) throw new Error("Informe o nome do registro.");
  if (!conteudo) throw new Error("Informe o conteúdo do registro.");

  const ttlBruto = Number(corpo.ttl);
  const ttl = Number.isFinite(ttlBruto) && ttlBruto >= 1 ? Math.floor(ttlBruto) : 1;

  const prioridadeBruta = Number(corpo.prioridade);
  const prioridade =
    corpo.prioridade === undefined || corpo.prioridade === null || corpo.prioridade === ""
      ? undefined
      : Number.isFinite(prioridadeBruta) && prioridadeBruta >= 0
        ? Math.floor(prioridadeBruta)
        : undefined;

  return { tipo, nome, conteudo, ttl, prioridade };
}

async function registrarAuditoria(
  actorId: string,
  acao: string,
  dominio: { id: string; fqdn: string; organizationId: string },
  metadata: Record<string, unknown>,
) {
  await prisma.operationsAuditEvent.create({
    data: {
      actorId,
      organizationId: dominio.organizationId,
      action: acao,
      entityType: "DomainAsset",
      entityId: dominio.id,
      metadata: JSON.parse(JSON.stringify({ fqdn: dominio.fqdn, ...metadata })),
    },
  });
}

async function autorizar(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) return { erro: NextResponse.json({ error: "Não autorizado." }, { status: 401 }) };
  if (!sameOrigin(request)) {
    return { erro: NextResponse.json({ error: "Origem não autorizada." }, { status: 403 }) };
  }
  return { admin };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ fqdn: string }> }) {
  const { admin, erro } = await autorizar(request);
  if (erro) return erro;

  try {
    const { fqdn } = await params;
    const dominio = await resolverZona(decodeURIComponent(fqdn));
    const entrada = lerEntrada(((await request.json().catch(() => ({}))) ?? {}) as Corpo);

    const criado = await provedorDeDns().criar(dominio.cloudflareZoneId!, entrada);
    await registrarAuditoria(admin!.id, "DNS_REGISTRO_CRIADO", dominio, { registro: criado });

    return NextResponse.json({ ok: true, registro: criado });
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Não foi possível criar o registro.";
    return NextResponse.json({ ok: false, error: mensagem }, { status: 400 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ fqdn: string }> }) {
  const { admin, erro } = await autorizar(request);
  if (erro) return erro;

  try {
    const { fqdn } = await params;
    const dominio = await resolverZona(decodeURIComponent(fqdn));
    const corpo = ((await request.json().catch(() => ({}))) ?? {}) as Corpo;
    const registroId = cleanText(corpo.registroId, 64);
    if (!registroId) throw new Error("Informe qual registro alterar.");

    const entrada = lerEntrada(corpo);
    const atualizado = await provedorDeDns().atualizar(dominio.cloudflareZoneId!, registroId, entrada);
    await registrarAuditoria(admin!.id, "DNS_REGISTRO_ALTERADO", dominio, { registroId, registro: atualizado });

    return NextResponse.json({ ok: true, registro: atualizado });
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Não foi possível alterar o registro.";
    return NextResponse.json({ ok: false, error: mensagem }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ fqdn: string }> }) {
  const { admin, erro } = await autorizar(request);
  if (erro) return erro;

  try {
    const { fqdn } = await params;
    const dominio = await resolverZona(decodeURIComponent(fqdn));
    const corpo = ((await request.json().catch(() => ({}))) ?? {}) as Corpo;
    const registroId = cleanText(corpo.registroId, 64);
    if (!registroId) throw new Error("Informe qual registro apagar.");

    await provedorDeDns().remover(dominio.cloudflareZoneId!, registroId);
    // O espelho no banco sai junto: deixar a linha órfã faria a tela mostrar
    // um registro que já não existe até a próxima sincronização.
    await prisma.dnsRecord.deleteMany({ where: { cloudflareRecordId: registroId } });
    await registrarAuditoria(admin!.id, "DNS_REGISTRO_APAGADO", dominio, { registroId });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Não foi possível apagar o registro.";
    return NextResponse.json({ ok: false, error: mensagem }, { status: 400 });
  }
}
