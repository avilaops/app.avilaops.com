import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import {
  CobrancaSemLink,
  enviarCobrancaPorEmail,
  enviarCobrancaPorWhatsapp,
  type AlvoEnvio,
  type ConteudoEnvio,
} from "@/lib/entrega-cobranca";
import { prisma } from "@/lib/prisma";

/**
 * O operador envia uma cobrança (ou o resumo de uma fatura) ao cliente, por
 * e-mail ou WhatsApp. As duas rotas — por cobrança e por fatura — passam por
 * aqui, para a trava, a auditoria e as mensagens de erro serem uma só.
 *
 * Trava de segurança: o envio é em MODO DE TESTE por padrão. Para mandar ao
 * cliente de verdade, o corpo precisa dizer `teste: false` de propósito — não
 * dá para disparar a um cliente real sem essa escolha explícita. No teste, o
 * operador informa `destinoTeste` (o próprio e-mail/número).
 *
 * Auditoria em dois tempos, para não existir mensagem que saiu sem rastro:
 *
 * 1. ANTES de enviar, grava a intenção (`COBRANCA_ENVIO_INICIADO`), já com o
 *    cliente dono da fatura, para a trilha por cliente achar a intenção que
 *    ficou sem desfecho. Se essa gravação falha, nada é enviado.
 * 2. DEPOIS, grava o desfecho, apontando para a intenção (`tentativaId`):
 *    `COBRANCA_ENVIADA`, `COBRANCA_ENVIO_FALHOU` (o provedor não entregou),
 *    `COBRANCA_ENVIO_RECUSADO` (nem tentou: sem destino, fatura cancelada...)
 *    ou `COBRANCA_ENVIO_ERRO`.
 *
 * Intenção sem desfecho na trilha quer dizer "pode ter saído e não sei": é o
 * caso de o banco cair entre o envio e o segundo registro. A resposta também
 * diz isso (`registrado: false` e um aviso), em vez de um "ok" limpo. Quem lista
 * essas intenções é `listarEnviosSemDesfecho` (`auditoria-envio-cobranca.ts`).
 *
 * As respostas de erro levam `error` (lido pelo helper `chamar()` do painel) e
 * `erro` (o nome da casa) com o mesmo texto.
 */
const AVISO_SEM_DESFECHO =
  "Não consegui gravar o resultado na auditoria: ficou só o registro de que o envio começou. Avise quem cuida do sistema.";

/**
 * O cliente dono do alvo, para a intenção entrar na trilha dele. Uma leitura
 * pela chave primária. Não achou ou a leitura falhou: `null`, como era antes —
 * a intenção é gravada do mesmo jeito e o envio decide o resto (alvo que não
 * existe sai como recusado).
 */
async function clienteDoAlvo(alvo: AlvoEnvio): Promise<string | null> {
  const daFatura = { subscription: { select: { organizationId: true } } };
  try {
    if (alvo.tipo === "cobranca") {
      const cobranca = await prisma.subscriptionCharge.findUnique({
        where: { id: alvo.id },
        select: { invoice: { select: daFatura } },
      });
      return cobranca?.invoice.subscription.organizationId ?? null;
    }
    const fatura = await prisma.subscriptionInvoice.findUnique({ where: { id: alvo.id }, select: daFatura });
    return fatura?.subscription.organizationId ?? null;
  } catch (erro) {
    console.error(`[cobranca] não descobri o cliente de ${alvo.tipo} ${alvo.id}; a intenção vai sem ele`, erro);
    return null;
  }
}

export async function responderEnvio(request: NextRequest, alvo: AlvoEnvio) {
  const falha = (msg: string, status: number) => NextResponse.json({ erro: msg, error: msg }, { status });

  const admin = await getAdmin();
  if (!admin) return falha("Faça login para continuar.", 401);
  // Dinheiro e contato com cliente são do dono.
  if (!ehDono(admin.role)) return falha("Só o dono pode enviar cobrança.", 403);
  if (!sameOrigin(request)) return falha("Origem não autorizada.", 403);

  const corpo = (await request.json().catch(() => null)) as
    | { canal?: unknown; teste?: unknown; destinoTeste?: unknown; conteudo?: unknown }
    | null;

  const canal = corpo?.canal === "whatsapp" ? "whatsapp" : corpo?.canal === "email" ? "email" : null;
  if (!canal) return falha("Informe o canal: email ou whatsapp.", 400);

  // O que enviar: link de pagamento (padrão), só a fatura, ou os dois.
  const conteudo: ConteudoEnvio =
    corpo?.conteudo === "fatura" ? "fatura" : corpo?.conteudo === "ambos" ? "ambos" : "cobranca";

  // Só manda ao cliente real quando teste é EXPLICITAMENTE false.
  const teste = corpo?.teste !== false;
  const destinoTeste = typeof corpo?.destinoTeste === "string" ? corpo.destinoTeste.trim() : "";
  if (teste && !destinoTeste) return falha("Em modo de teste, informe destinoTeste (seu e-mail ou número).", 400);

  const entidadeDoAlvo = alvo.tipo === "cobranca" ? "SubscriptionCharge" : "SubscriptionInvoice";
  const pedido = { canal, conteudo, teste, ...(teste ? { destinoTeste } : {}) };

  const clienteId = await clienteDoAlvo(alvo);

  // 1. A intenção, antes de qualquer mensagem sair. Sem ela, não envia.
  let tentativaId: string;
  try {
    const intencao = await prisma.operationsAuditEvent.create({
      data: {
        actorId: admin.id,
        organizationId: clienteId,
        action: "COBRANCA_ENVIO_INICIADO",
        entityType: entidadeDoAlvo,
        entityId: alvo.id,
        metadata: pedido,
      },
    });
    tentativaId = String(intencao.id);
  } catch (erro) {
    console.error(`[cobranca] não registrei a intenção de envio de ${alvo.tipo} ${alvo.id}; nada foi enviado`, erro);
    return falha("Não consegui registrar o envio na auditoria. Nada foi enviado.", 503);
  }

  // 2. O desfecho. Devolve se ficou gravado, para a resposta não esconder.
  const registrarDesfecho = async (
    action: string,
    dados: { organizationId?: string; entityType?: string; entityId?: string; metadata: Prisma.InputJsonObject },
  ) => {
    try {
      await prisma.operationsAuditEvent.create({
        data: {
          actorId: admin.id,
          // Recusado e erro não trazem o cliente do envio: vale o da intenção.
          organizationId: dados.organizationId ?? clienteId,
          action,
          entityType: dados.entityType ?? entidadeDoAlvo,
          entityId: dados.entityId ?? alvo.id,
          metadata: { ...pedido, ...dados.metadata, tentativaId },
        },
      });
      return true;
    } catch (erro) {
      console.error(
        `[cobranca] SEM DESFECHO NA AUDITORIA: ${action} de ${alvo.tipo} ${alvo.id} (tentativa ${tentativaId})`,
        dados.metadata,
        erro,
      );
      return false;
    }
  };
  const falhaRegistrada = (msg: string, status: number, registrado: boolean, extra: Record<string, unknown> = {}) => {
    const texto = registrado ? msg : `${msg} ${AVISO_SEM_DESFECHO}`;
    return NextResponse.json(
      { erro: texto, error: texto, ...extra, ...(registrado ? {} : { registrado: false }) },
      { status },
    );
  };

  let resultado;
  try {
    const opcoes = teste ? { destinoTeste, conteudo } : { conteudo };
    resultado =
      canal === "email" ? await enviarCobrancaPorEmail(alvo, opcoes) : await enviarCobrancaPorWhatsapp(alvo, opcoes);
  } catch (erro) {
    if (erro instanceof CobrancaSemLink) {
      const registrado = await registrarDesfecho("COBRANCA_ENVIO_RECUSADO", { metadata: { motivo: erro.message } });
      return falhaRegistrada(erro.message, 409, registrado);
    }
    console.error(`[cobranca] falha ao enviar ${alvo.tipo} ${alvo.id} por ${canal}`, erro);
    const registrado = await registrarDesfecho("COBRANCA_ENVIO_ERRO", {
      metadata: { erro: (erro instanceof Error ? erro.message : String(erro)).slice(0, 500) },
    });
    return falhaRegistrada("Não consegui enviar a cobrança.", 500, registrado);
  }

  // Envio a cliente é ação externa: deixa rastro, no cliente certo
  // (organizationId) para a trilha por cliente achar. A ação distingue
  // enviado de tentativa falha, pra auditoria não contar um 502 como contato.
  const naCobranca = Boolean(resultado.chargeId) && conteudo !== "fatura";
  const registrado = await registrarDesfecho(resultado.enviado ? "COBRANCA_ENVIADA" : "COBRANCA_ENVIO_FALHOU", {
    organizationId: resultado.organizationId,
    entityType: naCobranca ? "SubscriptionCharge" : "SubscriptionInvoice",
    entityId: naCobranca && resultado.chargeId ? resultado.chargeId : resultado.invoiceId,
    metadata: {
      destino: resultado.destino,
      enviado: resultado.enviado,
      invoiceId: resultado.invoiceId,
      chargeId: resultado.chargeId,
    },
  });

  if (!resultado.enviado) {
    return falhaRegistrada("O envio falhou no provedor. Veja o log do servidor.", 502, registrado, {
      destino: resultado.destino,
    });
  }
  // A mensagem saiu. Sem o desfecho gravado, a resposta diz — não é um "ok" limpo.
  return NextResponse.json({
    ok: true,
    canal,
    teste,
    destino: resultado.destino,
    registrado,
    ...(registrado ? {} : { aviso: AVISO_SEM_DESFECHO }),
  });
}
