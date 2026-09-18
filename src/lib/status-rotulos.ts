export type TomStatus = "neutro" | "bom" | "atencao" | "ruim" | "info";

export type StatusRotulado = { texto: string; tom: TomStatus };

export const MAPA_STATUS: Readonly<Record<string, StatusRotulado>> = {
  active: { texto: "Ativo", tom: "bom" },
  pending: { texto: "Pendente", tom: "atencao" },
  inactive: { texto: "Inativo", tom: "neutro" },
  paused: { texto: "Pausado", tom: "neutro" },
  archived: { texto: "Arquivado", tom: "neutro" },
  error: { texto: "Erro", tom: "ruim" },
  failed: { texto: "Erro", tom: "ruim" },
  connected: { texto: "Conectado", tom: "bom" },
  disconnected: { texto: "Desconectado", tom: "ruim" },
  expired: { texto: "Expirado", tom: "ruim" },
  verified: { texto: "Verificado", tom: "bom" },
  unverified: { texto: "Não verificado", tom: "atencao" },
  received: { texto: "Recebido", tom: "info" },
  sent: { texto: "Enviado", tom: "bom" },
  delivered: { texto: "Entregue", tom: "bom" },
  read: { texto: "Lido", tom: "bom" },
  draft: { texto: "Rascunho", tom: "neutro" },
  scheduled: { texto: "Agendado", tom: "info" },
  published: { texto: "Publicado", tom: "bom" },
  running: { texto: "Em andamento", tom: "info" },
  done: { texto: "Concluído", tom: "bom" },
  completed: { texto: "Concluído", tom: "bom" },
  success: { texto: "Concluído", tom: "bom" },
  healthy: { texto: "Saudável", tom: "bom" },
  degraded: { texto: "Degradado", tom: "atencao" },
  down: { texto: "Fora do ar", tom: "ruim" },
  ok: { texto: "OK", tom: "bom" },
  moved: { texto: "Movido", tom: "neutro" },
  initializing: { texto: "Inicializando", tom: "info" },
  deleted: { texto: "Excluído", tom: "neutro" },
  onboarding: { texto: "Em implantação", tom: "info" },
  trial: { texto: "Em teste", tom: "info" },
  suspended: { texto: "Suspenso", tom: "ruim" },
  cancelled: { texto: "Cancelado", tom: "neutro" },
  canceled: { texto: "Cancelado", tom: "neutro" },
  syncing: { texto: "Sincronizando", tom: "info" },
  queued: { texto: "Na fila", tom: "info" },
  processing: { texto: "Processando", tom: "info" },
  processed: { texto: "Processado", tom: "bom" },
  skipped: { texto: "Ignorado", tom: "neutro" },
  unknown: { texto: "Desconhecido", tom: "neutro" },
  // Operação: tarefa, projeto, cliente e lead — os mesmos rótulos que a
  // Visão central mantinha em mapa próprio até 17/09/2026.
  todo: { texto: "A fazer", tom: "neutro" },
  in_progress: { texto: "Em andamento", tom: "info" },
  blocked: { texto: "Bloqueada", tom: "ruim" },
  planning: { texto: "Planejamento", tom: "info" },
  waiting: { texto: "Em espera", tom: "atencao" },
  qualified: { texto: "Qualificado", tom: "info" },
  diagnosis: { texto: "Diagnóstico", tom: "info" },
  proposal: { texto: "Proposta", tom: "info" },
  won: { texto: "Ganho", tom: "bom" },
  lost: { texto: "Perdido", tom: "neutro" },
  renewal_due: { texto: "Renovação próxima", tom: "atencao" },
  // Meta: leads, verificação do Business Manager e account_status das contas de anúncio.
  new: { texto: "Novo", tom: "atencao" },
  imported: { texto: "Importado", tom: "bom" },
  converted: { texto: "Convertido", tom: "bom" },
  not_verified: { texto: "Não verificado", tom: "atencao" },
  disabled: { texto: "Desativada", tom: "ruim" },
  unsettled: { texto: "Pagamento pendente", tom: "ruim" },
  pending_risk_review: { texto: "Em análise de risco", tom: "atencao" },
  pending_settlement: { texto: "Acerto pendente", tom: "atencao" },
  in_grace_period: { texto: "Em período de carência", tom: "atencao" },
  pending_closure: { texto: "Encerramento pendente", tom: "atencao" },
  closed: { texto: "Encerrada", tom: "neutro" },
  any_active: { texto: "Ativa", tom: "bom" },
  any_closed: { texto: "Encerrada", tom: "neutro" },
};

/** Objetivo da campanha na Marketing API (ODAX `OUTCOME_*` e os legados). */
export const OBJETIVO_CAMPANHA: Readonly<Record<string, string>> = {
  OUTCOME_AWARENESS: "Reconhecimento",
  OUTCOME_TRAFFIC: "Tráfego",
  OUTCOME_ENGAGEMENT: "Engajamento",
  OUTCOME_LEADS: "Leads",
  OUTCOME_APP_PROMOTION: "Promoção do app",
  OUTCOME_SALES: "Vendas",
  BRAND_AWARENESS: "Reconhecimento",
  REACH: "Alcance",
  LINK_CLICKS: "Tráfego",
  POST_ENGAGEMENT: "Engajamento",
  LEAD_GENERATION: "Leads",
  CONVERSIONS: "Conversões",
  MESSAGES: "Mensagens",
  VIDEO_VIEWS: "Visualizações de vídeo",
};

export function rotuloObjetivo(codigo: string | null | undefined): string | null {
  if (!codigo) return null;
  return OBJETIVO_CAMPANHA[codigo.trim().toUpperCase()] ?? codigo;
}

function humanizar(codigo: string): string {
  const limpo = codigo.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  return limpo.charAt(0).toUpperCase() + limpo.slice(1);
}

export function rotuloStatus(codigo: string | null | undefined): StatusRotulado {
  const bruto = typeof codigo === "string" ? codigo.trim() : "";
  if (!bruto) return { texto: "Sem status", tom: "neutro" };

  const conhecido = MAPA_STATUS[bruto.toLowerCase()];
  if (conhecido) return conhecido;

  return { texto: humanizar(bruto), tom: "neutro" };
}
