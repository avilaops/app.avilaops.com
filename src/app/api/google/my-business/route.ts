import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import {
  listBusinessLocations,
  generateAiReviewReply,
} from "@/lib/google-mybusiness";

export async function GET() {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const locations = await listBusinessLocations();

  return NextResponse.json({
    status: "ok",
    totalLocations: locations.length,
    locations,
    // Sem API de avaliações (ver listBusinessLocations): nenhuma avaliação inventada.
    reviews: [],
  });
}

export async function POST(request: Request) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, locationName, reviewerName, rating, comment, tone } = body;

    if (action === "generate_reply") {
      const generatedReply = generateAiReviewReply(
        locationName || "Empresa",
        reviewerName || "Cliente",
        rating || 5,
        comment,
        tone || "ACOLHEDOR"
      );

      return NextResponse.json({
        status: "ok",
        action: "generated_reply",
        reply: generatedReply,
      });
    }

    return NextResponse.json({ error: "Ação não suportada" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: "Erro ao processar solicitação", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
