import type { ConteudoEnvio } from "@/lib/entrega-cobranca";

export type EtapaRegua = "PRE_DUE" | "DUE" | "OVERDUE";

export type EtapaCalculada = {
  stage: EtapaRegua;
  scheduledFor: Date;
  conteudo: ConteudoEnvio;
};

const FUSO = "America/Sao_Paulo";
export const JANELA_DE_ENVIO_MS = 24 * 60 * 60 * 1000;

function partesNoFuso(data: Date) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(data);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => Number(partes.find((p) => p.type === tipo)?.value);
  return { ano: valor("year"), mes: valor("month"), dia: valor("day"), hora: valor("hour"), minuto: valor("minute"), segundo: valor("second") };
}

/** Converte uma data civil e hora de São Paulo no instante UTC correspondente. */
function instanteEmSaoPaulo(ano: number, mes: number, dia: number, hora: number) {
  const chute = new Date(Date.UTC(ano, mes - 1, dia, hora));
  const local = partesNoFuso(chute);
  const deslocamento = Date.UTC(local.ano, local.mes - 1, local.dia, local.hora, local.minuto, local.segundo) - chute.getTime();
  return new Date(Date.UTC(ano, mes - 1, dia, hora) - deslocamento);
}

function adicionarDias(data: Date, dias: number) {
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate() + dias));
}

export function etapasDaRegua(vencimento: Date): EtapaCalculada[] {
  const etapa = (stage: EtapaRegua, dias: number, conteudo: ConteudoEnvio): EtapaCalculada => {
    const data = adicionarDias(vencimento, dias);
    return {
      stage,
      scheduledFor: instanteEmSaoPaulo(data.getUTCFullYear(), data.getUTCMonth() + 1, data.getUTCDate(), 9),
      conteudo,
    };
  };
  return [etapa("PRE_DUE", -5, "fatura"), etapa("DUE", 0, "ambos"), etapa("OVERDUE", 3, "ambos")];
}

export function itemProcessavel(agendadoPara: Date, agora: Date) {
  const atraso = agora.getTime() - agendadoPara.getTime();
  return atraso >= 0 && atraso <= JANELA_DE_ENVIO_MS;
}
