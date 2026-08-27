import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordJobsSiteRead, serializeJobPosting } from "@/lib/job-postings";
import { verifyServiceJwt } from "@/lib/service-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vagas publicadas, consumidas pelo build de jobs.avilaops.com.
 *
 * Máquina-a-máquina, no mesmo molde de `/api/public/leads`: o site estático
 * nunca carrega segredo, quem chama é o processo de build.
 */
export async function GET(request: NextRequest) {
  const caller = verifyServiceJwt(request);
  if (!caller) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const postings = await prisma.jobPosting.findMany({
    where: {
      status: "PUBLISHED",
      // Defesa na leitura: mesmo que uma vaga vencida escape para PUBLISHED,
      // ela não vai parar no site nem gerar JobPosting expirado no Google.
      validThrough: { gt: new Date() },
    },
    // Ordem determinística: sem isso, dois builds sem mudança editorial
    // poderiam gerar HTML em ordem diferente.
    orderBy: [{ postedAt: "desc" }, { ref: "asc" }],
  });

  // Quem lê esta rota é o build do site. Carimbar a leitura é o que permite ao
  // painel avisar "site desatualizado" quando uma vaga muda depois do último
  // build. Nunca derruba a resposta: ver `recordJobsSiteRead`.
  await recordJobsSiteRead(postings.length);

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    total: postings.length,
    postings: postings.map(serializeJobPosting),
  });
}
