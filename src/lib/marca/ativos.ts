import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { saveOrganizationBrandAssetFile } from "@/lib/brand-asset-storage";

/**
 * Gravação de um ativo da marca: guarda o arquivo, aposenta a versão anterior
 * daquele tipo, cria a nova e deixa o evento de auditoria. Upload manual e
 * geração automática de ícones passam os dois por aqui — versão e procedência
 * seguem a mesma regra nos dois caminhos.
 */

export const SELECAO_ATIVO = {
  id: true,
  assetType: true,
  name: true,
  mimeType: true,
  sizeBytes: true,
  dimensions: true,
  version: true,
  isCurrent: true,
} satisfies Prisma.OrganizationBrandAssetSelect;

export type AtivoGravado = Prisma.OrganizationBrandAssetGetPayload<{ select: typeof SELECAO_ATIVO }>;

export type PedidoGravacao = {
  organizationId: string;
  assetType: string;
  fileName: string;
  buffer: Buffer;
  mimeType: string;
  format: string;
  dimensions?: string | null;
  notes?: string | null;
  /** Quem operou: e-mail vai no ativo, id vai na auditoria. */
  admin: { id: string; email: string };
  action?: string;
  /** Vai junto no evento de auditoria (ex.: de qual logo o ícone saiu). */
  metadataExtra?: Prisma.JsonObject;
};

export async function gravarAtivoDaMarca(pedido: PedidoGravacao): Promise<AtivoGravado> {
  const {
    organizationId,
    assetType,
    fileName,
    buffer,
    mimeType,
    format,
    dimensions,
    notes,
    admin,
    action = "ORGANIZATION_BRAND_ASSET_UPLOADED",
    metadataExtra,
  } = pedido;

  const storageKey = await saveOrganizationBrandAssetFile(
    organizationId,
    assetType,
    fileName,
    buffer,
    mimeType,
  );

  return prisma.$transaction(async (transaction) => {
    const previousCount = await transaction.organizationBrandAsset.count({
      where: { organizationId, assetType },
    });

    await transaction.organizationBrandAsset.updateMany({
      where: { organizationId, assetType, isCurrent: true },
      data: { isCurrent: false },
    });

    const created = await transaction.organizationBrandAsset.create({
      data: {
        organizationId,
        assetType,
        name: fileName,
        storageKey,
        format,
        mimeType,
        dimensions: dimensions || null,
        sizeBytes: buffer.length,
        version: String(previousCount + 1),
        isCurrent: true,
        notes: notes || null,
        uploadedBy: admin.email,
      },
      select: SELECAO_ATIVO,
    });

    await transaction.operationsAuditEvent.create({
      data: {
        actorId: admin.id,
        organizationId,
        action,
        entityType: "OrganizationBrandAsset",
        entityId: created.id,
        metadata: {
          assetType,
          mimeType,
          sizeBytes: buffer.length,
          version: created.version,
          ...(metadataExtra ?? {}),
        },
      },
    });

    return created;
  });
}
