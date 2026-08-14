import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cleanText } from "@/lib/http";
import { verifyServiceJwt } from "@/lib/service-auth";

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

  return NextResponse.json({ ok: true, id: lead.id, created_at: lead.createdAt });
}
