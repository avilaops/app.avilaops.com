import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { getGa4OverviewMetrics } from "@/lib/google-analytics";

export async function GET() {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const metrics = await getGa4OverviewMetrics();

  return NextResponse.json({
    status: "ok",
    metrics,
  });
}
