import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { audienceCount, renderCampaign } from "@/lib/newsletter";
import { readCampaignPayload } from "@/lib/newsletter-payload";

/**
 * Prévia renderizada pelo mesmo código que envia. Existe para a tela nunca
 * montar HTML por conta própria: o que aparece aqui é byte a byte o que sai.
 */
export async function POST(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const payload = readCampaignPayload(body);
  const rendered = renderCampaign(payload, "https://app.avilaops.com/newsletter/descadastro?token=exemplo");
  const recipients = await audienceCount(payload.audienceTags);

  return NextResponse.json({ html: rendered.html, text: rendered.text, recipients });
}
