import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const allowedStatuses = new Set(["NOT_STARTED", "PILOT", "PRODUCTION", "DOCUMENTED"]);

type MetricInput = { label?: unknown; value?: unknown };

function optionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function sanitizeMetrics(value: unknown): Array<{ label: string; value: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => entry as MetricInput)
    .map((entry) => ({
      label: optionalText(entry.label, 60) ?? "",
      value: optionalText(entry.value, 60) ?? "",
    }))
    .filter((entry) => entry.label);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    status?: unknown;
    summary?: unknown;
    metrics?: unknown;
  };

  const status = typeof body.status === "string" ? body.status : "";
  if (!allowedStatuses.has(status)) {
    return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
  }

  const summary = optionalText(body.summary, 400);
  const metrics = sanitizeMetrics(body.metrics);

  try {
    const updated = await prisma.partnerCase.update({
      where: { id },
      data: { status, summary, metrics },
    });

    return NextResponse.json({ ok: true, id: updated.id, status: updated.status });
  } catch {
    return NextResponse.json({ error: "Caso não encontrado." }, { status: 404 });
  }
}
