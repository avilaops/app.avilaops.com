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
    select: { id: true, previewFileName: true, previewMimeType: true },
  });

  if (!deliverable?.previewFileName) {
    return NextResponse.json({ error: "Prévia não encontrada." }, { status: 404 });
  }

  const stream = readDeliverableFileStream(deliverable.id, deliverable.previewFileName);
  const webStream = Readable.toWeb(stream) as ReadableStream;

  return new Response(webStream, {
    headers: {
      "Content-Type": deliverable.previewMimeType || "application/octet-stream",
      "Cache-Control": "private, max-age=300",
    },
  });
}
