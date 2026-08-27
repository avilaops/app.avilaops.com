import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import {
  listBusinessLocations,
  generateAiReviewReply,
  MAPPED_BUSINESSES,
  type BusinessTone,
} from "@/lib/google-mybusiness";

export async function GET() {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const locations = await listBusinessLocations();

  // Exemplo de avaliações pendentes para teste de resposta por IA
  const sampleReviews = [
    {
      id: "rev_1",
      locationId: "loc_brasa_mineira",
      locationName: "Brasa Mineira",
      reviewerName: "Carlos Eduardo Silva",
      starRating: 5,
      comment: "A comida mineira é fantástica! O torresmo e a feijoada estavam perfeitos, ótimo atendimento.",
      createTime: new Date(Date.now() - 3600000 * 4).toISOString(),
      tone: "ACOLHEDOR" as BusinessTone,
    },
    {
      id: "rev_2",
      locationId: "loc_grb_seguranca",
      locationName: "GRB Engenharia de Segurança",
      reviewerName: "Dra. Mariana Costa",
      starRating: 5,
      comment: "Excelente consultoria em laudos de segurança do trabalho e NR-12. Equipe muito técnica e pontual.",
      createTime: new Date(Date.now() - 3600000 * 12).toISOString(),
      tone: "FORMAL" as BusinessTone,
    },
    {
      id: "rev_3",
      locationId: "loc_trailers_brasa",
      locationName: "Trailers (Av. Brasa Mineira)",
      reviewerName: "Lucas Mendes",
      starRating: 4,
      comment: "Lanche muito gostoso e ambiente super descontraído na avenida!",
      createTime: new Date(Date.now() - 3600000 * 24).toISOString(),
      tone: "DESCONTRAIDO" as BusinessTone,
    },
  ];

  return NextResponse.json({
    status: "ok",
    totalLocations: locations.length,
    locations,
    reviews: sampleReviews,
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
