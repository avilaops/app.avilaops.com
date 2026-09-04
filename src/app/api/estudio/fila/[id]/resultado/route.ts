import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ehChamadaDoWorker } from "@/lib/estudio/servidor";
import { salvarRender } from "@/lib/estudio-storage";

const TAMANHO_MAX = 200 * 1024 * 1024;

/** O worker devolve o arquivo (ou o erro). multipart: status, log, arquivo. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!ehChamadaDoWorker(request)) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const { id } = await params;
  const render = await prisma.studioRender.findUnique({ where: { id } });
  if (!render) return NextResponse.json({ error: "Renderização não encontrada." }, { status: 404 });
  if (render.status === "DONE") return NextResponse.json({ ok: true, repetido: true });

  const form = await request.formData();
  const status = form.get("status") === "concluido" ? "DONE" : "FAILED";
  const log = typeof form.get("log") === "string" ? (form.get("log") as string).replace(/\r/g, "").slice(-20000) : null;
  const arquivo = form.get("arquivo");

  if (status === "DONE") {
    if (!(arquivo instanceof File) || arquivo.size <= 0 || arquivo.size > TAMANHO_MAX) {
      return NextResponse.json({ error: "Arquivo ausente ou grande demais." }, { status: 400 });
    }
    const mime = render.kind === "video" ? "video/mp4" : "image/png";
    const nome = await salvarRender(render.id, Buffer.from(await arquivo.arrayBuffer()), mime);
    await prisma.studioRender.update({
      where: { id },
      data: { status: "DONE", fileName: nome, mimeType: mime, sizeBytes: arquivo.size, log, finishedAt: new Date() },
    });
  } else {
    await prisma.studioRender.update({ where: { id }, data: { status: "FAILED", log, finishedAt: new Date() } });
  }
  return NextResponse.json({ ok: true });
}
