import { mkdir, unlink, writeFile } from "fs/promises";
import { createReadStream } from "fs";
import path from "path";

function storageRoot(): string {
  const configured = process.env.DELIVERABLES_STORAGE_PATH;
  return configured
    ? path.resolve(/*turbopackIgnore: true*/ configured)
    : path.join(process.cwd(), "storage", "deliverables");
}

function deliverableDir(deliverableId: string): string {
  return path.join(storageRoot(), deliverableId);
}

function safeExtension(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : "";
}

export async function saveDeliverableFile(
  deliverableId: string,
  slot: "preview" | "full",
  originalFileName: string,
  bytes: Buffer,
): Promise<{ storedName: string }> {
  const dir = deliverableDir(deliverableId);
  await mkdir(dir, { recursive: true });
  const storedName = `${slot}${safeExtension(originalFileName)}`;
  await writeFile(path.join(dir, storedName), bytes);
  return { storedName };
}

export function readDeliverableFileStream(deliverableId: string, storedName: string) {
  return createReadStream(path.join(deliverableDir(deliverableId), storedName));
}

export async function deleteDeliverableFile(deliverableId: string, storedName: string) {
  await unlink(path.join(deliverableDir(deliverableId), storedName)).catch(() => {});
}
