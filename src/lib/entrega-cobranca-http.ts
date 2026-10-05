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
 * As respostas de erro levam `error` (lido pelo helper `chamar()` do painel) e
 * `erro` (o nome da casa) com o mesmo texto.
 */
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

  try {
    const opcoes = teste ? { destinoTeste, conteudo } : { conteudo };
    const resultado =
      canal === "email" ? await enviarCobrancaPorEmail(alvo, opcoes) : await enviarCobrancaPorWhatsapp(alvo, opcoes);

    // Envio a cliente é ação externa: deixa rastro, no cliente certo
    // (organizationId) para a trilha por cliente achar. A ação distingue
    // enviado de tentativa falha, pra auditoria não contar um 502 como contato.
    await prisma.operationsAuditEvent
      .create({
        data: {
          actorId: admin.id,
          organizationId: resultado.organizationId,
          action: resultado.enviado ? "COBRANCA_ENVIADA" : "COBRANCA_ENVIO_FALHOU",
          entityType: resultado.chargeId && conteudo !== "fatura" ? "SubscriptionCharge" : "SubscriptionInvoice",
          entityId: resultado.chargeId && conteudo !== "fatura" ? resultado.chargeId : resultado.invoiceId,
          metadata: {
            canal,
            conteudo,
            teste,
            destino: resultado.destino,
            enviado: resultado.enviado,
            invoiceId: resultado.invoiceId,
            chargeId: resultado.chargeId,
          },
        },
      })
      .catch((e) => console.error("[cobranca] não auditei o envio", e));

    if (!resultado.enviado) {
      const msg = "O envio falhou no provedor. Veja o log do servidor.";
      return NextResponse.json({ erro: msg, error: msg, destino: resultado.destino }, { status: 502 });
    }
    return NextResponse.json({ ok: true, canal, teste, destino: resultado.destino });
  } catch (erro) {
    if (erro instanceof CobrancaSemLink) return falha(erro.message, 409);
    console.error(`[cobranca] falha ao enviar ${alvo.tipo} ${alvo.id} por ${canal}`, erro);
    return falha("Não consegui enviar a cobrança.", 500);
  }
}
