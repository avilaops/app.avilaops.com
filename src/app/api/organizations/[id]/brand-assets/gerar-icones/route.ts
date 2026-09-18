import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { cleanText, sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { readOrganizationBrandAssetBuffer } from "@/lib/brand-asset-storage";
import { gravarAtivoDaMarca } from "@/lib/marca/ativos";
import {
  ICONES_DERIVADOS,
  MIMES_ORIGEM,
  gerarIcones,
  manifesto,
  saneiaOpcoes,
  trechoHtml,
} from "@/lib/marca/icones";

// sharp é binário nativo: fora do bundle, senão o standalone não acha o .node.
export const runtime = "nodejs";
export const maxDuration = 60;

const EXTENSAO: Record<string, string> = { "image/png": "png", "image/x-icon": "ico" };

/** Lista o que dá para gerar e de quais logos, para a tela montar o formulário. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });

  const { id } = await params;
  const ativos = await prisma.organizationBrandAsset.findMany({
    where: { organizationId: id, isCurrent: true },
    select: { id: true, assetType: true, name: true, mimeType: true, dimensions: true, updatedAt: true },
    orderBy: { assetType: "asc" },
  });

  const origens = ativos.filter((a) => a.mimeType && MIMES_ORIGEM.has(a.mimeType));
  const jaTem = new Set(ativos.map((a) => a.assetType));

  return NextResponse.json({
    origens: origens.map((a) => ({
      id: a.id,
      assetType: a.assetType,
      nome: a.name,
      mimeType: a.mimeType,
      atualizadoEm: a.updatedAt.toISOString(),
    })),
    icones: ICONES_DERIVADOS.map((i) => ({
      assetType: i.assetType,
      arquivo: i.arquivo,
      largura: i.largura,
      altura: i.altura,
      descricao: i.descricao,
      jaExiste: jaTem.has(i.assetType),
    })),
  });
}

/**
 * Gera o conjunto de ícones a partir de uma logo já cadastrada e grava cada um
 * como versão nova do seu tipo. Por padrão só preenche o que falta; `substituir`
 * refaz também o que já existe.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  const { id } = await params;
  const organizacao = await prisma.organization.findUnique({
    where: { id },
    select: { id: true, name: true, siteUrl: true },
  });
  if (!organizacao) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const origemId = cleanText(corpo.origemAssetId, 40);
  if (!origemId) return NextResponse.json({ error: "Escolha a logo de origem." }, { status: 400 });

  const origem = await prisma.organizationBrandAsset.findFirst({
    where: { id: origemId, organizationId: id },
    select: { id: true, assetType: true, name: true, mimeType: true, storageKey: true, version: true },
  });
  if (!origem?.storageKey) {
    return NextResponse.json({ error: "Logo de origem não encontrada." }, { status: 404 });
  }
  if (!origem.mimeType || !MIMES_ORIGEM.has(origem.mimeType)) {
    return NextResponse.json(
      { error: "A logo de origem precisa ser PNG, JPG, WEBP ou SVG." },
      { status: 400 },
    );
  }

  const bytes = await readOrganizationBrandAssetBuffer(origem.storageKey);
  if (!bytes) {
    return NextResponse.json({ error: "Não foi possível ler o arquivo da logo." }, { status: 502 });
  }

  const opcoes = saneiaOpcoes(corpo);
  const substituir = corpo.substituir === true;

  // Sem `substituir`, tipo que já tem arquivo atual fica de fora: ninguém quer
  // sobrescrever um favicon desenhado à mão com um recorte automático.
  if (!substituir) {
    const existentes = await prisma.organizationBrandAsset.findMany({
      where: { organizationId: id, isCurrent: true },
      select: { assetType: true },
    });
    const jaTem = new Set(existentes.map((a) => a.assetType));
    const candidatos = (opcoes.tipos.length ? opcoes.tipos : ICONES_DERIVADOS.map((i) => i.assetType))
      .filter((t) => !jaTem.has(t));
    if (candidatos.length === 0) {
      return NextResponse.json(
        { error: "Todos os ícones escolhidos já têm arquivo. Marque “substituir” para refazer." },
        { status: 409 },
      );
    }
    opcoes.tipos = candidatos;
  }

  let gerados;
  try {
    gerados = await gerarIcones(bytes, origem.mimeType, opcoes);
  } catch (erro) {
    return NextResponse.json(
      { error: erro instanceof Error ? erro.message : "Não foi possível gerar os ícones." },
      { status: 400 },
    );
  }

  const procedencia = `Gerado a partir de “${origem.assetType}” v${origem.version ?? "1"} (${origem.name ?? "arquivo"}).`;
  const salvos = [];
  for (const icone of gerados) {
    const salvo = await gravarAtivoDaMarca({
      organizationId: id,
      assetType: icone.spec.assetType,
      fileName: icone.spec.arquivo,
      buffer: icone.buffer,
      mimeType: icone.spec.mimeType,
      format: EXTENSAO[icone.spec.mimeType] ?? "png",
      dimensions: `${icone.spec.largura}x${icone.spec.altura}`,
      notes: procedencia,
      admin: { id: admin.id, email: admin.email },
      action: "ORGANIZATION_BRAND_ICON_GENERATED",
      metadataExtra: {
        origemAssetId: origem.id,
        origemAssetType: origem.assetType,
        fundo: opcoes.fundo,
        margem: opcoes.margem,
        recortar: opcoes.recortar,
      },
    });
    salvos.push(salvo);
  }

  return NextResponse.json(
    {
      gerados: salvos,
      origem: { id: origem.id, assetType: origem.assetType, version: origem.version },
      html: trechoHtml(),
      manifest: manifesto(organizacao.name, opcoes.fundo),
    },
    { status: 201 },
  );
}
