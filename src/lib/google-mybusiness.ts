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

/**
 * Locais do Google Meu Negócio.
 *
 * Até 17/09/2026 esta função devolvia `MAPPED_BUSINESSES`, uma lista escrita à
 * mão com endereços, notas e avaliações inventados ("Av. Principal, 1000"),
 * e a tela os mostrava como "sincronizados via Google Business Profile API".
 * A lista foi removida.
 *
 * Por que não há leitura real: a API do Business Profile está com cota 0 no
 * projeto `contatos-424700` (pedido de acesso negado pelo Google), e isso vale
 * para qualquer conta que chame por esse projeto. A alternativa pública é a
 * Places API (New), que depende de faturamento ativo no projeto da chave
 * `GOOGLE_MAPS_PLACES_API` (em 17/09/2026 ela respondia REQUEST_DENIED por
 * faturamento desativado). Até lá, nenhum local: a tela mostra estado vazio.
 */
export async function listBusinessLocations(): Promise<MappedLocation[]> {
  return [];
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
