import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { uploadOrganizationBrandAsset, getObjectBuffer, getPrivateObjectUrl } from "@/lib/r2";

function hasR2Config() {
  return Boolean(
    process.env.R2_BUCKET &&
      process.env.CLOUDFLARE_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY,
  );
}

function storageRoot(): string {
  const configured = process.env.ORGANIZATION_ASSETS_STORAGE_PATH;
  return configured
    ? path.resolve(/*turbopackIgnore: true*/ configured)
    : path.join(process.cwd(), "storage", "organization-assets");
}

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

export async function saveOrganizationBrandAssetFile(
  organizationId: string,
  assetType: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  if (hasR2Config()) {
    return uploadOrganizationBrandAsset(organizationId, assetType, fileName, buffer, mimeType);
  }

  const safeAssetType = safeSegment(assetType);
  const safeName = safeSegment(fileName);
  const relativeKey = path.join(
    organizationId,
    safeAssetType,
    `${Date.now()}-${safeName}`,
  );
  const absolutePath = path.join(storageRoot(), relativeKey);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer);
  return `local:${relativeKey.replace(/\\/g, "/")}`;
}

export async function getOrganizationBrandAssetPrivateUrl(key: string): Promise<string | null> {
  if (key.startsWith("local:")) return null;
  return getPrivateObjectUrl(key);
}

export function readLocalOrganizationBrandAsset(key: string) {
  if (!key.startsWith("local:")) return null;
  const absolutePath = localAssetPath(key);
  if (!absolutePath) return null;
  return createReadStream(absolutePath);
}

function localAssetPath(key: string): string | null {
  const relativeKey = key.slice("local:".length);
  const root = storageRoot();
  const absolutePath = path.resolve(root, relativeKey);
  return absolutePath.startsWith(root) ? absolutePath : null;
}

/**
 * Carrega o ativo inteiro na memória, venha ele do disco ou do R2. Usado por
 * quem precisa reprocessar o arquivo no servidor — a geração de ícones a partir
 * da logo, por exemplo — e não só servir o download.
 */
export async function readOrganizationBrandAssetBuffer(key: string): Promise<Buffer | null> {
  if (key.startsWith("local:")) {
    const absolutePath = localAssetPath(key);
    if (!absolutePath) return null;
    try {
      return await readFile(absolutePath);
    } catch {
      return null;
    }
  }
  try {
    return await getObjectBuffer(key);
  } catch {
    return null;
  }
}
