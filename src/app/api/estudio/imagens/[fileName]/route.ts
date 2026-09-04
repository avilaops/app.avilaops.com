import { NextResponse } from "next/server";
import { lerImagem } from "@/lib/estudio-storage";

/** Pública de propósito: o Chromium do worker busca sem cookie. Nome aleatório de 128 bits. */
export async function GET(_request: Request, { params }: { params: Promise<{ fileName: string }> }) {
  const { fileName } = await params;
  const imagem = await lerImagem(fileName);
  if (!imagem) return NextResponse.json({ error: "Imagem não encontrada." }, { status: 404 });
  return new NextResponse(new Uint8Array(imagem.bytes), {
    headers: {
      "Content-Type": imagem.mimeType,
      "Content-Length": String(imagem.size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
