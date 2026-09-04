import { NextRequest, NextResponse } from "next/server";
import type { StudioRender } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ehChamadaDoWorker, trabalhoParaWorker } from "@/lib/estudio/servidor";

export const dynamic = "force-dynamic";

/**
 * O worker pergunta "tem trabalho?". Pega o pedido mais antigo em PENDING e o marca
 * RUNNING na mesma instrução (SKIP LOCKED), então dois workers nunca pegam o mesmo.
 * 204 quando a fila está vazia.
 */
export async function GET(request: NextRequest) {
  if (!ehChamadaDoWorker(request)) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });

  const linhas = await prisma.$queryRaw<StudioRender[]>`
    UPDATE "operations"."studio_renders" SET "status" = 'RUNNING', "started_at" = now()
    WHERE "id" = (
      SELECT "id" FROM "operations"."studio_renders"
      WHERE "status" = 'PENDING' ORDER BY "created_at" LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "piece_id" AS "pieceId", "kind", "status", "width", "height", "fps", "duration", "snapshot",
              "file_name" AS "fileName", "mime_type" AS "mimeType", "size_bytes" AS "sizeBytes", "log",
              "started_at" AS "startedAt", "finished_at" AS "finishedAt", "created_at" AS "createdAt"`;
  if (!linhas.length) return new NextResponse(null, { status: 204 });
  return NextResponse.json(trabalhoParaWorker(linhas[0]));
}
