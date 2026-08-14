import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const deliverable = await prisma.deliverable.findUnique({
    where: { accessToken: token },
    select: { status: true },
  });

  return NextResponse.json({ paid: deliverable?.status === "PAID" });
}
