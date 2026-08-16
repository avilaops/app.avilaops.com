import { NextRequest, NextResponse } from "next/server";
import { baixarCobrancaPorIdExterno } from "@/lib/assinaturas";
import { markDeliverablePaidAndNotify } from "@/lib/deliverables";
import { getCobrancaChargeStatus, getPixChargeStatus } from "@/lib/efi-cobranca";
import { prisma } from "@/lib/prisma";

/**
 * Notificação do Efí (PIX e Cobranças).
 *
 * Duas regras que valem para tudo aqui:
 *
 * **O corpo do POST é aviso, não prova.** Ele chega por HTTP, é repetido pelo
 * próprio Efí, pode chegar fora de ordem e, sem mTLS terminado na borda, pode
 * ser forjado por qualquer um que conheça o formato. Antes desta versão, um
 * `{"pix":[{"txid":"..."}]}` de qualquer origem dava baixa numa fatura. Agora
 * o txid é só uma pista: quem diz se entrou dinheiro é a API do Efí.
 *
 * **O endpoint é idempotente por natureza.** Receber o mesmo evento dez vezes
 * tem que dar no mesmo — a baixa guarda o instante do pagamento e não deixa
 * cobrança paga voltar para pendente.
 */

const PAID_COBRANCA_STATUSES = new Set(["paid", "approved", "settled"]);
/** No PIX o único estado que significa dinheiro na conta. */
const PIX_PAGO = "CONCLUIDA";

/**
 * Segredo na URL da notificação.
 *
 * O Efí autentica webhook por mTLS, que exige terminar o certificado do lado
 * do proxy — configuração que este servidor ainda não tem. Enquanto isso, o
 * token na query string tira o endpoint de "qualquer um chama".
 *
 * Sem `EFI_WEBHOOK_TOKEN` configurado, segue aceitando (é como está hoje em
 * produção) — mas a confirmação pela API continua valendo, então um POST
 * forjado não move dinheiro nenhum.
 */
function autorizado(request: NextRequest): boolean {
  const esperado = process.env.EFI_WEBHOOK_TOKEN?.trim();
  if (!esperado) return true;

  const recebido =
    request.nextUrl.searchParams.get("token") ??
    request.headers.get("x-webhook-token") ??
    "";

  return recebido === esperado;
}

async function handlePixNotification(body: Record<string, unknown>) {
  const entries = Array.isArray(body.pix) ? body.pix : [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const txid = (entry as Record<string, unknown>).txid;
    if (typeof txid !== "string") continue;

    // Só confirma o que conhecemos: txid que não bate com nenhuma cobrança
    // nossa não vira consulta à API — senão o endpoint vira ferramenta de
    // varredura para quem quiser descobrir txids válidos.
    const [entregavel, mensalidade] = await Promise.all([
      prisma.deliverableCharge.findFirst({
        where: { method: "PIX", externalId: txid, status: "PENDING" },
      }),
      prisma.subscriptionCharge.findFirst({ where: { method: "PIX", externalId: txid } }),
    ]);

    if (!entregavel && !mensalidade) continue;

    let situacao: string;
    try {
      situacao = await getPixChargeStatus(txid);
    } catch (error) {
      console.error(`Falha ao confirmar o PIX ${txid} no Efí`, error);
      continue;
    }

    if (situacao !== PIX_PAGO) continue;

    if (entregavel) {
      await prisma.deliverableCharge.update({
        where: { id: entregavel.id },
        data: { status: "PAID", paidAt: new Date() },
      });
      await markDeliverablePaidAndNotify(entregavel.deliverableId);
      continue;
    }

    await baixarCobrancaPorIdExterno(txid, "PAID");
  }
}

/**
 * O formato exato da notificação de Cobranças (boleto/cartão) do Efí não foi
 * validado em sandbox neste ambiente. Em vez de confiar no payload recebido,
 * usamos a notificação apenas como gatilho para reconsultar o status real de
 * cada cobrança pendente diretamente na API do Efí.
 */
async function reconcilePendingCobrancas() {
  const pending = await prisma.deliverableCharge.findMany({
    where: { method: { in: ["BOLETO", "CARD"] }, status: "PENDING", externalId: { not: null } },
  });

  for (const charge of pending) {
    if (!charge.externalId) continue;
    try {
      const status = await getCobrancaChargeStatus(charge.externalId);
      if (PAID_COBRANCA_STATUSES.has(status.toLowerCase())) {
        await prisma.deliverableCharge.update({
          where: { id: charge.id },
          data: { status: "PAID", paidAt: new Date() },
        });
        await markDeliverablePaidAndNotify(charge.deliverableId);
      }
    } catch (error) {
      console.error(`Falha ao reconciliar cobrança ${charge.externalId}`, error);
    }
  }

  // As mesmas duas formas de pagamento, agora nas mensalidades.
  const mensalidades = await prisma.subscriptionCharge.findMany({
    where: {
      method: { in: ["BOLETO", "CARD"] },
      status: { notIn: ["PAID", "CANCELLED"] },
      externalId: { not: null },
    },
  });

  for (const cobranca of mensalidades) {
    if (!cobranca.externalId) continue;
    try {
      const status = await getCobrancaChargeStatus(cobranca.externalId);
      if (PAID_COBRANCA_STATUSES.has(status.toLowerCase())) {
        await baixarCobrancaPorIdExterno(cobranca.externalId, "PAID");
      }
    } catch (error) {
      console.error(`Falha ao reconciliar mensalidade ${cobranca.externalId}`, error);
    }
  }
}

export async function POST(request: NextRequest) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (body && Array.isArray(body.pix)) {
    await handlePixNotification(body);
  } else {
    await reconcilePendingCobrancas();
  }

  // Sempre 200 quando autorizado: o Efí reenvia o que não recebe confirmação,
  // e devolver erro por um txid desconhecido faria a fila dele repetir para
  // sempre um evento que nunca vai ser nosso.
  return NextResponse.json({ ok: true });
}
