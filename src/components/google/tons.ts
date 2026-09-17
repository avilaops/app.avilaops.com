import type { BusinessTone } from "@/lib/google-mybusiness";

/** Rótulo em português do tom de voz de cada perfil do Google Meu Negócio. */
export const ROTULO_TOM: Record<BusinessTone, string> = {
  ACOLHEDOR: "Acolhedor",
  TECNOLOGICO: "Tecnológico",
  FORMAL: "Formal/Técnico",
  ELEGANTE: "Elegante",
  DESCONTRAIDO: "Descontraído",
  MOTIVADOR: "Motivador/Fit",
  ATENCIOSO: "Atencioso",
  OBJETIVO: "Objetivo",
};

export const ORIGEM_MEU_NEGOCIO = "listBusinessLocations() em src/lib/google-mybusiness.ts";
export const ORIGEM_GA4 = "getGa4OverviewMetrics() em src/lib/google-analytics.ts";

export const OBSERVACAO_MEU_NEGOCIO =
  "Sem fonte ativa: a API do Business Profile está com cota 0 no projeto contatos-424700 e a Places API depende de faturamento ativo. listBusinessLocations() devolve lista vazia; nenhum número é inventado.";

export const OBSERVACAO_GA4 =
  "Lido da Analytics Data API pela conta de serviço de produção: soma de todas as propriedades GA4 que ela enxerga (ativos agora = runRealtimeReport; 30 dias = runReport; taxa de rejeição e duração ponderadas por sessões). Cache de 60 s.";

const formatoNota2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatoNota1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function notaComDuasCasas(valor: number) {
  return formatoNota2.format(valor);
}

export function notaComUmaCasa(valor: number) {
  return formatoNota1.format(valor);
}
