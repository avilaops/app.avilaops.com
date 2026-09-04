import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";

/**
 * Arquivos do Estúdio em disco local (bind mount ./storage, como a newsletter):
 *   imagens/  → o que o usuário sobe para usar nos templates (rota pública, nome aleatório)
 *   renders/  → o que o worker devolve (mp4/png), servido só para quem está logado
 */

const IMAGENS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export const TAMANHO_MAX_IMAGEM = 12 * 1024 * 1024;

const RENDERS: Record<string, string> = {
  "video/mp4": "mp4",
  "image/png": "png",
};

function raiz(): string {
  const configurado = process.env.ESTUDIO_STORAGE_PATH;
  return configurado
    ? path.resolve(/*turbopackIgnore: true*/ configurado)
    : path.join(process.cwd(), "storage", "estudio");
}

export function imagemPermitida(mime: string): boolean {
  return mime in IMAGENS;
}

export async function salvarImagem(buffer: Buffer, mime: string): Promise<string> {
  const ext = IMAGENS[mime];
  if (!ext) throw new Error("Formato de imagem não suportado.");
  const nome = `${crypto.randomBytes(16).toString("hex")}.${ext}`;
  const pasta = path.join(raiz(), "imagens");
  await mkdir(pasta, { recursive: true });
  await writeFile(path.join(pasta, nome), buffer);
  return nome;
}

export async function lerImagem(nome: string) {
  if (!/^[a-f0-9]{32}\.(png|jpg|webp)$/.test(nome)) return null;
  return lerArquivo(path.join(raiz(), "imagens", nome));
}

export async function salvarRender(renderId: string, buffer: Buffer, mime: string): Promise<string> {
  const ext = RENDERS[mime];
  if (!ext) throw new Error("Formato de saída não suportado.");
  if (!/^[a-z0-9]+$/.test(renderId)) throw new Error("id inválido");
  const nome = `${renderId}.${ext}`;
  const pasta = path.join(raiz(), "renders");
  await mkdir(pasta, { recursive: true });
  await writeFile(path.join(pasta, nome), buffer);
  return nome;
}

export function caminhoDoRender(nome: string): string | null {
  if (!/^[a-z0-9]+\.(mp4|png)$/.test(nome)) return null;
  return path.join(raiz(), "renders", nome);
}

export function mimeDoNome(nome: string): string {
  const ext = path.extname(nome).slice(1);
  if (ext === "mp4") return "video/mp4";
  if (ext === "jpg") return "image/jpeg";
  return `image/${ext}`;
}

async function lerArquivo(absoluto: string) {
  try {
    const info = await stat(absoluto);
    if (!info.isFile()) return null;
    return { bytes: await readFile(absoluto), size: info.size, mimeType: mimeDoNome(absoluto) };
  } catch {
    return null;
  }
}
