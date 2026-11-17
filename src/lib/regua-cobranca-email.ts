import type { ConteudoEnvio } from "@/lib/entrega-cobranca";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { enviarCobrancaPorEmail } from "@/lib/entrega-cobranca";
import { prisma } from "@/lib/prisma";

export type EtapaRegua = "PRE_DUE" | "DUE" | "OVERDUE";

export type EtapaCalculada = {
  stage: EtapaRegua;
  scheduledFor: Date;
  conteudo: ConteudoEnvio;
};

const FUSO = "America/Sao_Paulo";
export const JANELA_DE_ENVIO_MS = 24 * 60 * 60 * 1000;
export const ESPERA_REPETICAO_MS = 30 * 60 * 1000;
export const PRAZO_CLAIM_MS = 10 * 60 * 1000;

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

export function proximoEstadoAposFalha(tentativas: number, agora: Date) {
  return tentativas < 2
    ? { status: "PENDING" as const, nextAttemptAt: new Date(agora.getTime() + ESPERA_REPETICAO_MS) }
    : { status: "FAILED" as const, nextAttemptAt: null };
}

export function deveCancelarPorStatus(status: string) {
  return status === "PAID" || status === "CANCELLED";
}

export function claimExpirou(reivindicadoEm: Date, agora: Date) {
  return agora.getTime() - reivindicadoEm.getTime() > PRAZO_CLAIM_MS;
}

type ItemReivindicado = {
  id: string;
  invoiceId: string;
  stage: EtapaRegua;
  attempts: number;
  claimToken: string;
};

export type ResumoRegua = {
  reconciliados: number;
  reivindicados: number;
  enviados: number;
  repeticoes: number;
  falhas: number;
  cancelados: number;
  ignorados: number;
};

async function reconciliarFila(agora: Date) {
  const faturas = await prisma.subscriptionInvoice.findMany({
    where: { status: { in: ["OPEN", "OVERDUE"] } },
    select: { id: true, dueDate: true },
  });
  const criacoes = faturas.flatMap((fatura) =>
    etapasDaRegua(fatura.dueDate).map((etapa) =>
      prisma.billingEmailDispatch.upsert({
        where: { invoiceId_stage: { invoiceId: fatura.id, stage: etapa.stage } },
        create: { invoiceId: fatura.id, stage: etapa.stage, scheduledFor: etapa.scheduledFor },
        update: {},
      }),
    ),
  );
  if (criacoes.length) await prisma.$transaction(criacoes);

  const cancelados = await prisma.billingEmailDispatch.updateMany({
    where: { status: { in: ["PENDING", "PROCESSING"] }, invoice: { status: { in: ["PAID", "CANCELLED"] } } },
    data: { status: "CANCELLED", cancelledAt: agora, claimToken: null, claimedAt: null },
  });
  const ignorados = await prisma.billingEmailDispatch.updateMany({
    where: { status: "PENDING", scheduledFor: { lt: new Date(agora.getTime() - JANELA_DE_ENVIO_MS) } },
    data: { status: "SKIPPED", lastError: "Janela de envio de 24 horas encerrada." },
  });
  const claimAntigo = new Date(agora.getTime() - PRAZO_CLAIM_MS);
  await prisma.billingEmailDispatch.updateMany({
    where: { status: "PROCESSING", claimedAt: { lt: claimAntigo }, attempts: { lt: 2 } },
    data: { status: "PENDING", claimToken: null, claimedAt: null, nextAttemptAt: agora },
  });
  await prisma.billingEmailDispatch.updateMany({
    where: { status: "PROCESSING", claimedAt: { lt: claimAntigo }, attempts: { gte: 2 } },
    data: { status: "FAILED", claimToken: null, claimedAt: null, lastError: "Processamento interrompido após a segunda tentativa." },
  });
  return { reconciliados: criacoes.length, cancelados: cancelados.count, ignorados: ignorados.count };
}

async function reivindicarItens(agora: Date, limite: number): Promise<ItemReivindicado[]> {
  const claimToken = randomUUID();
  const inicioDaJanela = new Date(agora.getTime() - JANELA_DE_ENVIO_MS);
  return prisma.$queryRaw<ItemReivindicado[]>(Prisma.sql`
    WITH candidatos AS (
      SELECT id FROM operations.billing_email_dispatches
      WHERE status = 'PENDING'
        AND scheduled_for <= ${agora}
        AND scheduled_for >= ${inicioDaJanela}
        AND COALESCE(next_attempt_at, scheduled_for) <= ${agora}
        AND attempts < 2
      ORDER BY COALESCE(next_attempt_at, scheduled_for), id
      FOR UPDATE SKIP LOCKED
      LIMIT ${limite}
    )
    UPDATE operations.billing_email_dispatches AS d
    SET status='PROCESSING', attempts=d.attempts+1, claimed_at=${agora}, claim_token=${claimToken}, updated_at=${agora}
    FROM candidatos WHERE d.id=candidatos.id
    RETURNING d.id, d.invoice_id AS "invoiceId", d.stage, d.attempts, d.claim_token AS "claimToken"
  `);
}

const conteudoDaEtapa = (stage: EtapaRegua): ConteudoEnvio => stage === "PRE_DUE" ? "fatura" : "ambos";
const mensagemDeErro = (erro: unknown) => (erro instanceof Error ? erro.message : String(erro)).slice(0, 500);

async function processarItem(item: ItemReivindicado, agora: Date) {
  const fatura = await prisma.subscriptionInvoice.findUnique({
    where: { id: item.invoiceId },
    select: { status: true, subscription: { select: { organizationId: true } } },
  });
  if (!fatura || deveCancelarPorStatus(fatura.status)) {
    await prisma.billingEmailDispatch.updateMany({
      where: { id: item.id, status: "PROCESSING", claimToken: item.claimToken },
      data: { status: "CANCELLED", cancelledAt: agora, claimToken: null, claimedAt: null },
    });
    return "cancelado" as const;
  }

  const conteudo = conteudoDaEtapa(item.stage);
  let tentativaId: string | null = null;
  try {
    const intencao = await prisma.operationsAuditEvent.create({
      data: {
        actorId: null,
        organizationId: fatura.subscription.organizationId,
        action: "COBRANCA_ENVIO_INICIADO",
        entityType: "SubscriptionInvoice",
        entityId: item.invoiceId,
        metadata: { canal: "email", conteudo, teste: false, origem: "regua-automatica", stage: item.stage, dispatchId: item.id },
      },
    });
    tentativaId = String(intencao.id);
    const resultado = await enviarCobrancaPorEmail({ tipo: "fatura", id: item.invoiceId }, { conteudo });
    if (!resultado.enviado) throw new Error("O provedor de e-mail recusou o envio.");

    let avisoAuditoria: string | null = null;
    try {
      await prisma.operationsAuditEvent.create({
        data: {
          actorId: null,
          organizationId: resultado.organizationId,
          action: "COBRANCA_ENVIADA",
          entityType: conteudo === "fatura" || !resultado.chargeId ? "SubscriptionInvoice" : "SubscriptionCharge",
          entityId: conteudo === "fatura" || !resultado.chargeId ? resultado.invoiceId : resultado.chargeId,
          metadata: { canal: "email", conteudo, teste: false, origem: "regua-automatica", stage: item.stage, dispatchId: item.id, tentativaId, destino: resultado.destino },
        },
      });
    } catch (erroAuditoria) {
      avisoAuditoria = `E-mail enviado, mas o desfecho não foi gravado: ${mensagemDeErro(erroAuditoria)}`;
      console.error(`[cobranca-regua] ${avisoAuditoria}`);
    }
    await prisma.billingEmailDispatch.updateMany({
      where: { id: item.id, status: "PROCESSING", claimToken: item.claimToken },
      data: { status: "SENT", sentAt: agora, claimToken: null, claimedAt: null, nextAttemptAt: null, lastError: avisoAuditoria },
    });
    return "enviado" as const;
  } catch (erro) {
    const motivo = mensagemDeErro(erro);
    if (tentativaId) {
      await prisma.operationsAuditEvent.create({
        data: {
          actorId: null,
          organizationId: fatura.subscription.organizationId,
          action: "COBRANCA_ENVIO_FALHOU",
          entityType: "SubscriptionInvoice",
          entityId: item.invoiceId,
          metadata: { canal: "email", conteudo, teste: false, origem: "regua-automatica", stage: item.stage, dispatchId: item.id, tentativaId, erro: motivo },
        },
      }).catch((erroAuditoria) => console.error("[cobranca-regua] falha ao auditar erro", erroAuditoria));
    }
    const proximo = proximoEstadoAposFalha(item.attempts, agora);
    await prisma.billingEmailDispatch.updateMany({
      where: { id: item.id, status: "PROCESSING", claimToken: item.claimToken },
      data: { ...proximo, claimToken: null, claimedAt: null, lastError: motivo },
    });
    return proximo.status === "PENDING" ? "repeticao" as const : "falha" as const;
  }
}

export async function processarReguaDeCobranca(agora = new Date(), limite = 50): Promise<ResumoRegua> {
  const reconciliacao = await reconciliarFila(agora);
  const itens = await reivindicarItens(agora, Math.max(1, Math.min(100, Math.trunc(limite))));
  const resumo: ResumoRegua = { ...reconciliacao, reivindicados: itens.length, enviados: 0, repeticoes: 0, falhas: 0 };
  for (const item of itens) {
    const resultado = await processarItem(item, agora);
    if (resultado === "enviado") resumo.enviados++;
    else if (resultado === "repeticao") resumo.repeticoes++;
    else if (resultado === "falha") resumo.falhas++;
    else resumo.cancelados++;
  }
  return resumo;
}

