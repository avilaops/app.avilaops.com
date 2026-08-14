import { Readable } from "stream";
import { NextResponse } from "next/server";
import { readDeliverableFileStream } from "@/lib/deliverable-storage";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const deliverable = await prisma.deliverable.findUnique({
    where: { accessToken: token },
    select: { id: true, status: true, fullFileName: true, fullMimeType: true, title: true },
  });

  if (!deliverable) {
    return NextResponse.json({ error: "Entregável não encontrado." }, { status: 404 });
  }
  if (deliverable.status !== "PAID") {
    return NextResponse.json(
      { error: "Pagamento ainda não confirmado." },
      { status: 402 },
    );
  }
  if (!deliverable.fullFileName) {
    return NextResponse.json({ error: "Arquivo não disponível." }, { status: 404 });
  }

  const stream = readDeliverableFileStream(deliverable.id, deliverable.fullFileName);
  const webStream = Readable.toWeb(stream) as ReadableStream;

  return new Response(webStream, {
    headers: {
      "Content-Type": deliverable.fullMimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${deliverable.title.replace(/[^a-z0-9-_ ]/gi, "")}${deliverable.fullFileName.match(/\.[a-z0-9]+$/i)?.[0] ?? ""}"`,
    },
  });
}
