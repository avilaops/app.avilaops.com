import { NextRequest, NextResponse } from "next/server";
import { open, stat } from "node:fs/promises";
import { getAdmin } from "@/lib/auth";
import { caminhoDoRender, mimeDoNome } from "@/lib/estudio-storage";
import { ehChamadaDoWorker } from "@/lib/estudio/servidor";

/**
 * Resultado de uma renderização, para quem está logado (ou para o n8n, com a chave de
 * serviço, publicar). Responde a Range porque o Safari do iPhone só toca vídeo assim.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ fileName: string }> }) {
  const admin = await getAdmin();
  if (!admin && !ehChamadaDoWorker(request)) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });

  const { fileName } = await params;
  const caminho = caminhoDoRender(fileName);
  if (!caminho) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  let tamanho: number;
  try {
    const info = await stat(caminho);
    if (!info.isFile()) throw new Error();
    tamanho = info.size;
  } catch {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }

  const mime = mimeDoNome(fileName);
  const baixar = request.nextUrl.searchParams.get("baixar") === "1";
  const cabecalhos: Record<string, string> = {
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "Content-Disposition": `${baixar ? "attachment" : "inline"}; filename="${fileName}"`,
  };

  const range = request.headers.get("range");
  let inicio = 0;
  let fim = tamanho - 1;
  let status = 200;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m) {
      if (m[1]) inicio = Number(m[1]);
      if (m[2]) fim = Math.min(Number(m[2]), tamanho - 1);
      if (!m[1] && m[2]) { inicio = Math.max(0, tamanho - Number(m[2])); fim = tamanho - 1; }
      if (inicio > fim || inicio >= tamanho) {
        return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${tamanho}` } });
      }
      status = 206;
      cabecalhos["Content-Range"] = `bytes ${inicio}-${fim}/${tamanho}`;
    }
  }
  cabecalhos["Content-Length"] = String(fim - inicio + 1);

  const fh = await open(caminho, "r");
  const buffer = Buffer.alloc(fim - inicio + 1);
  await fh.read(buffer, 0, buffer.length, inicio);
  await fh.close();
  return new NextResponse(new Uint8Array(buffer), { status, headers: cabecalhos });
}
