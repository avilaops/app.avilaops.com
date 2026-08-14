import { NextResponse } from "next/server";
import { clearAdminSession, getAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const admin = await getAdmin();
  if (admin) {
    await prisma.financeAuditEvent.create({
      data: {
        actorId: admin.id,
        action: "ADMIN_LOGOUT",
        entityType: "Session",
      },
    });
  }
  await clearAdminSession();
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
