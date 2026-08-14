import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { syncCloudflareDomains } from "@/lib/domain-sync";

export const runtime = "nodejs";

export async function POST() {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const results = await syncCloudflareDomains(admin.id);
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível sincronizar os domínios do Cloudflare.",
      },
      { status: 502 },
    );
  }
}
