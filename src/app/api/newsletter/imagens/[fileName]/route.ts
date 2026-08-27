import { NextResponse } from "next/server";
import { readCampaignImage } from "@/lib/newsletter-image-storage";

/**
 * Rota pública de propósito: o cliente de e-mail busca a imagem sem cookie
 * nenhum. O nome do arquivo é aleatório de 128 bits, então só quem recebeu a
 * campanha (ou quem ela encaminhar) chega até aqui.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileName: string }> },
) {
  const { fileName } = await params;
  const image = await readCampaignImage(fileName);
  if (!image) return NextResponse.json({ error: "Imagem não encontrada." }, { status: 404 });

  return new NextResponse(new Uint8Array(image.bytes), {
    headers: {
      "Content-Type": image.mimeType,
      "Content-Length": String(image.size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
