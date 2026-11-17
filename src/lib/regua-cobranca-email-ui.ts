const ROTULO_ETAPA: Record<string, string> = {
  PRE_DUE: "5 dias antes",
  DUE: "No vencimento",
  OVERDUE: "3 dias depois",
};

const ROTULO_STATUS: Record<string, string> = {
  PENDING: "Agendado",
  PROCESSING: "Enviando",
  SENT: "Enviado",
  FAILED: "Falhou",
  CANCELLED: "Cancelado",
  SKIPPED: "Ignorado",
};

export function descricaoDoLembrete(item: { stage: string; status: string; scheduledFor: string | Date }) {
  const quando = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(item.scheduledFor));
  return `${ROTULO_ETAPA[item.stage] ?? item.stage} • ${ROTULO_STATUS[item.status] ?? item.status} • ${quando}`;
}
