import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { importWiseStatement } from "@/lib/wise-import";

/** Extrato de conta pessoal é arquivo pequeno; acima disso é engano. */
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  let content: string;

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("arquivo");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Envie o arquivo CSV exportado da Wise." },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Arquivo grande demais para um extrato." },
        { status: 413 },
      );
    }
    content = await file.text();
  } else {
    content = await request.text();
    if (content.length > MAX_BYTES) {
      return NextResponse.json(
        { error: "Arquivo grande demais para um extrato." },
        { status: 413 },
      );
    }
  }

  if (!content.trim()) {
    return NextResponse.json({ error: "Arquivo vazio." }, { status: 400 });
  }

  try {
    const result = await importWiseStatement(content, { actorId: admin.id });

    return NextResponse.json({
      ok: true,
      accounts: result.accounts,
      credits: result.credits,
      debits: result.debits,
      ignored: result.ignored,
      scopeCounts: result.scopeCounts,
      // Só o começo da lista: o resto vive no evento de auditoria.
      skipped: result.skipped.slice(0, 20),
      skippedCount: result.skipped.length,
      periodStart: result.periodStart?.toISOString() ?? null,
      periodEnd: result.periodEnd?.toISOString() ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível importar o extrato.",
      },
      { status: 400 },
    );
  }
}
