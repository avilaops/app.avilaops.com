import { google } from "googleapis";

export type BusinessTone =
  | "ACOLHEDOR"
  | "TECNOLOGICO"
  | "ATENCIOSO"
  | "FORMAL"
  | "OBJETIVO"
  | "ELEGANTE"
  | "DESCONTRAIDO"
  | "MOTIVADOR";

export interface MappedLocation {
  id: string;
  name: string;
  category: string;
  segment: string;
  tone: BusinessTone;
  address: string;
  rating: number;
  reviewCount: number;
  pendingReviews: number;
  status: "ACTIVE" | "PENDING_VERIFICATION" | "NEEDS_SYNC";
}

export interface BusinessReview {
  id: string;
  locationId: string;
  reviewerName: string;
  reviewerPhoto?: string;
  starRating: 1 | 2 | 3 | 4 | 5;
  comment?: string;
  createTime: string;
  reply?: {
    comment: string;
    updateTime: string;
  };
}

export const MAPPED_BUSINESSES: MappedLocation[] = [
  {
    id: "loc_brasa_mineira",
    name: "Brasa Mineira",
    category: "Restaurante",
    segment: "Gastronomia",
    tone: "ACOLHEDOR",
    address: "Av. Principal, 1000 - São Paulo, SP",
    rating: 4.8,
    reviewCount: 342,
    pendingReviews: 2,
    status: "ACTIVE",
  },
  {
    id: "loc_avila_ops",
    name: "Ávila Ops Tecnologia",
    category: "Empresa de Software",
    segment: "Tecnologia / B2B",
    tone: "TECNOLOGICO",
    address: "Atendimento Nacional & Remoto / SP",
    rating: 5.0,
    reviewCount: 89,
    pendingReviews: 0,
    status: "ACTIVE",
  },
  {
    id: "loc_brilhax",
    name: "Brilhax",
    category: "Produtos & Serviços de Limpeza",
    segment: "Serviços",
    tone: "ATENCIOSO",
    address: "Rua Industrial, 250 - São Paulo, SP",
    rating: 4.7,
    reviewCount: 120,
    pendingReviews: 1,
    status: "ACTIVE",
  },
  {
    id: "loc_grb_seguranca",
    name: "GRB Engenharia de Segurança",
    category: "Engenharia & Segurança do Trabalho",
    segment: "Engenharia",
    tone: "FORMAL",
    address: "Av. Empresarial, 450 - Sala 82 - SP",
    rating: 4.9,
    reviewCount: 64,
    pendingReviews: 0,
    status: "ACTIVE",
  },
  {
    id: "loc_mello_transportes",
    name: "Mello Transportes",
    category: "Transporte & Logística",
    segment: "Transportes",
    tone: "OBJETIVO",
    address: "Rodovia Dutra, Km 210 - SP",
    rating: 4.6,
    reviewCount: 95,
    pendingReviews: 1,
    status: "ACTIVE",
  },
  {
    id: "loc_sorroche_beauty",
    name: "Sorroche Beauty",
    category: "Salão de Beleza & Estética",
    segment: "Beleza & Cuidados",
    tone: "ELEGANTE",
    address: "Rua das Flores, 88 - SP",
    rating: 4.9,
    reviewCount: 215,
    pendingReviews: 3,
    status: "ACTIVE",
  },
  {
    id: "loc_tui_tecnologia",
    name: "Tui Tecnologia",
    category: "Soluções Digitais & TI",
    segment: "Tecnologia",
    tone: "TECNOLOGICO",
    address: "Av. Paulista, 1500 - SP",
    rating: 4.8,
    reviewCount: 52,
    pendingReviews: 0,
    status: "ACTIVE",
  },
  {
    id: "loc_seteesete_eng",
    name: "Seteesete Engenharia",
    category: "Construção & Projetos",
    segment: "Engenharia",
    tone: "FORMAL",
    address: "Rua do Engenho, 310 - SP",
    rating: 4.9,
    reviewCount: 41,
    pendingReviews: 0,
    status: "ACTIVE",
  },
  {
    id: "loc_trailers_brasa",
    name: "Trailers (Av. Brasa Mineira)",
    category: "Food Park & Trailers",
    segment: "Gastronomia",
    tone: "DESCONTRAIDO",
    address: "Av. Principal, Ao lado do Brasa Mineira - SP",
    rating: 4.7,
    reviewCount: 180,
    pendingReviews: 2,
    status: "ACTIVE",
  },
  {
    id: "loc_voce_mais_fit",
    name: "Você Mais Fit",
    category: "Alimentação Saudável & Fitness",
    segment: "Saúde & Alimentação",
    tone: "MOTIVADOR",
    address: "Alameda Santos, 400 - SP",
    rating: 4.9,
    reviewCount: 168,
    pendingReviews: 1,
    status: "ACTIVE",
  },
];

function getGoogleCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON não configurado no .env");
  }
  return JSON.parse(raw);
}

export async function getGoogleMyBusinessClient() {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: getGoogleCredentials(),
      scopes: ["https://www.googleapis.com/auth/business.manage"],
    });
    return await auth.getClient();
  } catch (err) {
    console.warn("My Business API via Service Account em modo demonstrativo:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function listBusinessLocations(): Promise<MappedLocation[]> {
  try {
    const client = await getGoogleMyBusinessClient();
    if (!client) {
      return MAPPED_BUSINESSES;
    }
    return MAPPED_BUSINESSES;
  } catch (err) {
    console.error("Erro ao listar locais do My Business:", err);
    return MAPPED_BUSINESSES;
  }
}

export function generateAiReviewReply(
  locationName: string,
  reviewerName: string,
  rating: number,
  comment: string | undefined,
  tone: BusinessTone
): string {
  const firstName = reviewerName.split(" ")[0] || "Cliente";

  if (rating >= 4) {
    switch (tone) {
      case "ACOLHEDOR":
        return `Olá, ${firstName}! Muito obrigado pelo carinho e pela excelente nota. No ${locationName}, preparar tudo com dedicação e sabor é a nossa maior paixão. Esperamos ver você de volta em breve! 🍲✨`;
      case "TECNOLOGICO":
        return `Olá, ${firstName}! Agradecemos a excelente avaliação. Na ${locationName}, nosso compromisso é entregar inovação, estabilidade e resultados de ponta para o seu projeto. Estamos sempre à disposição! 🚀`;
      case "FORMAL":
        return `Prezado(a) ${firstName}, agradecemos a sua avaliação de ${rating} estrelas. Para a equipe da ${locationName}, a excelência técnica, normas de segurança e satisfação do cliente são pilares fundamentais. Permanecemos à disposição.`;
      case "ELEGANTE":
        return `Olá, ${firstName}! Agradecemos imensamente pela sua visita e pelo carinho. Na ${locationName}, cuidamos de cada detalhe para proporcionar uma experiência única e renovadora. Será um prazer recebê-la(o) novamente! ✨💆‍♀️`;
      case "DESCONTRAIDO":
        return `Fala, ${firstName}! Que demais ver seu feedback por aqui! A galera dos Trailers agradece a presença. Cola aqui de novo no fim de semana que o atendimento top tá garantido! 🍔🍟`;
      case "MOTIVADOR":
        return `Sensacional, ${firstName}! Ficamos muito felizes em fazer parte da sua rotina de bem-estar. No ${locationName}, cada escolha saudável é uma conquista. Continue firme na sua jornada fit! 💪🥗`;
      case "OBJETIVO":
      case "ATENCIOSO":
      default:
        return `Olá, ${firstName}! Muito obrigado pelo seu feedback positivo e pela nota ${rating}. A equipe da ${locationName} agradece a confiança e conta com você para a próxima!`;
    }
  } else {
    return `Olá, ${firstName}. Lamentamos muito que sua experiência no ${locationName} não tenha atingido suas expectativas. Valorizamos muito o seu feedback e gostaríamos de entender o ocorrido para corrigir imediatamente. Por favor, entre em contato conosco direto pelo WhatsApp ou e-mail de atendimento para resolvermos da melhor forma.`;
  }
}
