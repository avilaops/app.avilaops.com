import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";

/**
 * Imagem de campanha fica em disco local e é servida por rota pública.
 *
 * R2 assinado não serve aqui: o link de uma URL assinada expira, e e-mail é
 * aberto semanas depois. O nome do arquivo é aleatório — quem não recebeu o
 * e-mail não adivinha o endereço.
 */

const ALLOWED: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

export function isAllowedImage(mimeType: string): boolean {
  return mimeType in ALLOWED;
}

function storageRoot(): string {
  const configured = process.env.NEWSLETTER_STORAGE_PATH;
  return configured
    ? path.resolve(/*turbopackIgnore: true*/ configured)
    : path.join(process.cwd(), "storage", "newsletter");
}

export async function saveCampaignImage(buffer: Buffer, mimeType: string): Promise<string> {
  const extension = ALLOWED[mimeType];
  if (!extension) throw new Error("Formato de imagem não suportado.");

  const fileName = `${crypto.randomBytes(16).toString("hex")}.${extension}`;
  await mkdir(storageRoot(), { recursive: true });
  await writeFile(path.join(storageRoot(), fileName), buffer);
  return fileName;
}

export function campaignImagePath(fileName: string): string | null {
  if (!/^[a-f0-9]{32}\.(png|jpg|webp|gif)$/.test(fileName)) return null;
  return path.join(storageRoot(), fileName);
}

export async function readCampaignImage(fileName: string) {
  const absolute = campaignImagePath(fileName);
  if (!absolute) return null;
  try {
    const info = await stat(absolute);
    if (!info.isFile()) return null;
    const extension = path.extname(absolute).slice(1);
    const mimeType = extension === "jpg" ? "image/jpeg" : `image/${extension}`;
    return { bytes: await readFile(absolute), size: info.size, mimeType };
  } catch {
    return null;
  }
}
