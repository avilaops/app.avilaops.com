import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { cleanText, sameOrigin } from "@/lib/http";
import {
  collectClientContacts,
  importContacts,
  parseContactList,
  type ContactEntry,
} from "@/lib/newsletter";
import { prisma } from "@/lib/prisma";

function parseTags(value: unknown): string[] {
  return cleanText(value, 200)
    .split(/[,;]+/)
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 10);
}

export async function GET(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });

  const search = cleanText(request.nextUrl.searchParams.get("busca"), 120);
  const status = cleanText(request.nextUrl.searchParams.get("status"), 20).toUpperCase();

  const contacts = await prisma.newsletterContact.findMany({
    where: {
      ...(status && status !== "TODOS" ? { status } : {}),
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: "insensitive" as const } },
              { name: { contains: search, mode: "insensitive" as const } },
              { company: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  return NextResponse.json({ contacts });
}

export async function POST(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const mode = cleanText(body?.mode, 20) || "paste";
  const tags = parseTags(body?.tags);
  const keepMachineAddresses = body?.keepMachineAddresses === true;

  let entries: ContactEntry[] = [];
  let source = "MANUAL";

  if (mode === "clientes") {
    entries = await collectClientContacts();
    source = "CLIENTES";
  } else if (mode === "gmail") {
    // A varredura do Gmail acontece fora do servidor (conector no Claude Code
    // ou export manual) e chega aqui já como lista.
    const raw = Array.isArray(body?.entries) ? (body?.entries as unknown[]) : [];
    entries = raw
      .map((item) => {
        const record = item as Record<string, unknown>;
        return {
          email: cleanText(record?.email, 254),
          name: cleanText(record?.name, 160) || null,
          company: cleanText(record?.company, 160) || null,
        };
      })
      .filter((entry) => entry.email.length > 0);
    source = "GMAIL";
  } else {
    entries = parseContactList(cleanText(body?.raw, 200_000));
    source = "IMPORT";
  }

  if (entries.length === 0) {
    return NextResponse.json({ error: "Nenhum e-mail válido encontrado na importação." }, { status: 400 });
  }

  const summary = await importContacts(entries, { source, tags, keepMachineAddresses });

  await prisma.operationsAuditEvent.create({
    data: {
      actorId: admin.id,
      action: "NEWSLETTER_CONTACTS_IMPORTED",
      entityType: "NewsletterContact",
      metadata: { mode, source, tags, ...summary },
    },
  });

  return NextResponse.json({ summary });
}
