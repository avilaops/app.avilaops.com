import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { TAMANHO_MAX_IMAGEM, imagemPermitida, salvarImagem } from "@/lib/estudio-storage";

/** Imagem para usar num campo de template (personagem, captura de tela, foto). */
export async function POST(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Envie uma imagem." }, { status: 400 });
  if (file.size <= 0 || file.size > TAMANHO_MAX_IMAGEM) return NextResponse.json({ error: "A imagem deve ter até 12 MB." }, { status: 400 });
  if (!imagemPermitida(file.type)) return NextResponse.json({ error: "Use PNG, JPG ou WEBP." }, { status: 400 });

  const nome = await salvarImagem(Buffer.from(await file.arrayBuffer()), file.type);
  return NextResponse.json({ url: `/api/estudio/imagens/${nome}`, fileName: nome });
}
