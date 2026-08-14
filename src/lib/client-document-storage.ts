import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { uploadClientDocument, getClientDocumentDownloadUrl } from "@/lib/r2";

function hasR2Config() {
  return Boolean(
    process.env.R2_BUCKET &&
      process.env.CLOUDFLARE_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY,
  );
}

function storageRoot(): string {
  const configured = process.env.CLIENT_DOCUMENTS_STORAGE_PATH;
  return configured
    ? path.resolve(/*turbopackIgnore: true*/ configured)
    : path.join(process.cwd(), "storage", "client-registration-documents");
}

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

export async function saveClientDocumentFile(
  requestId: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  if (hasR2Config()) {
    return uploadClientDocument(requestId, fileName, buffer, mimeType);
  }

  const safeName = safeSegment(fileName);
  const relativeKey = path.join(requestId, `${Date.now()}-${safeName}`);
  const absolutePath = path.join(storageRoot(), relativeKey);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer);
  return `local:${relativeKey.replace(/\\/g, "/")}`;
}

export async function getClientDocumentUrl(key: string): Promise<string | null> {
  if (key.startsWith("local:")) return null;
  return getClientDocumentDownloadUrl(key);
}

export function readLocalClientDocument(key: string) {
  if (!key.startsWith("local:")) return null;
  const relativeKey = key.slice("local:".length);
  const absolutePath = path.resolve(storageRoot(), relativeKey);
  const root = storageRoot();
  if (!absolutePath.startsWith(root)) return null;
  return createReadStream(absolutePath);
}
