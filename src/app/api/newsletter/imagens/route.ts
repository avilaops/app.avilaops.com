import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { publicBaseUrl } from "@/lib/newsletter";
import { MAX_IMAGE_SIZE, isAllowedImage, saveCampaignImage } from "@/lib/newsletter-image-storage";

export async function POST(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Envie uma imagem." }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_SIZE) {
    return NextResponse.json({ error: "A imagem deve ter até 8 MB." }, { status: 400 });
  }
  if (!isAllowedImage(file.type)) {
    return NextResponse.json({ error: "Use PNG, JPG, WEBP ou GIF." }, { status: 400 });
  }

  const fileName = await saveCampaignImage(Buffer.from(await file.arrayBuffer()), file.type);
  return NextResponse.json({ url: `${publicBaseUrl()}/api/newsletter/imagens/${fileName}`, fileName });
}
