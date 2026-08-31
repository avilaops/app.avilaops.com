import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cleanText } from "@/lib/http";
import { verifyServiceJwt } from "@/lib/service-auth";
import { avisarPorEmail } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const caller = verifyServiceJwt(request);
  if (!caller) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: {
    name?: unknown;
    company?: unknown;
    whatsapp?: unknown;
    moment?: unknown;
    challenge?: unknown;
    source?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const name = cleanText(body.name, 200);
  const company = cleanText(body.company, 200);
  const whatsapp = cleanText(body.whatsapp, 60);
  const moment = cleanText(body.moment, 200);
  const challenge = cleanText(body.challenge, 4000);
  const source = cleanText(body.source, 100) || "avilaops.com";

  if (!name || !company || !challenge) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  const notes = [moment ? `Momento: ${moment}` : null, challenge]
    .filter(Boolean)
    .join("\n\n");

  const lead = await prisma.lead.create({
    data: {
      companyName: company,
      contactName: name,
      contactPhone: whatsapp || null,
      channel: source,
      notes,
    },
  });

  await prisma.operationsAuditEvent.create({
    data: {
      action: "LEAD_CREATED",
      entityType: "Lead",
      entityId: lead.id,
      metadata: { source, via: caller.iss },
    },
  });

  // Lead que ninguém vê é lead perdido. Até 31/08/2026 o aviso saía do Worker
  // de captura pelo Resend, cuja chave está inválida: o formulário do site
  // gravava a linha e não avisava ninguém. Agora sai daqui, pelo servidor da
  // casa, e nunca derruba a gravação do lead.
  const destino = process.env.LEAD_NOTIFY_TO?.trim() || "nicolas@avilaops.com";
  const numero = whatsapp.replace(/[^0-9]/g, "");
  const linhas = [
    `<p><strong>${escapar(name)}</strong>, de ${escapar(company)}</p>`,
    numero ? `<p>WhatsApp: <a href="https://wa.me/${numero}">${escapar(whatsapp)}</a></p>` : "",
    moment ? `<p>Momento da empresa: ${escapar(moment)}</p>` : "",
    `<p>O que a pessoa escreveu:</p><p>${escapar(challenge).split("\n").join("<br/>")}</p>`,
    `<p>Origem: ${escapar(source)}. Abrir no painel: <a href="https://app.avilaops.com/operacao">app.avilaops.com/operacao</a></p>`,
  ].filter(Boolean);

  await avisarPorEmail({
    to: destino,
    subject: `Lead novo: ${company} (${name})`,
    html: linhas.join(""),
  });

  return NextResponse.json({ ok: true, id: lead.id, created_at: lead.createdAt });
}

/** O lead vem de formulário público: nada dele entra cru no HTML do aviso. */
function escapar(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
